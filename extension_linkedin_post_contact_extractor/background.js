// background.js

let extractionRunning = false;
let stats = { found: 0, saved: 0 };
let config = {};

// Base API URL from config
const WBL_API_URL = "http://localhost:8000";

// for local use--------- "http://localhost:8000"
// for production use ------------- "https://whitebox-learning.com/api"


function getApiUrl() {
    if (WBL_API_URL.includes('/api')) {
        return WBL_API_URL.replace(/\/$/, "");
    }
    return WBL_API_URL.replace(/\/$/, "") + "/api";
}

const API_BASE_URL = getApiUrl();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start_extraction') {
        startExtraction();
    } else if (message.action === 'stop_extraction') {
        stopExtraction();
    } else if (message.action === 'extract_found') {
        processExtractedData(message.data);
    }
});

function safeSendMessage(message) {
    try {
        chrome.runtime.sendMessage(message, () => {
            const lastError = chrome.runtime.lastError;
            if (lastError && !lastError.message.includes('Could not establish connection')) {
                console.warn('Other runtime error:', lastError.message);
            }
        });
    } catch (e) {

    }
}

async function startExtraction() {
    extractionRunning = true;
    stats = { found: 0, saved: 0 };

    await chrome.storage.local.set({ extractionResults: [], isRunning: true, stats: stats });

    const result = await chrome.storage.local.get(['employeeId', 'candidateId', 'sourceEmail', 'apiToken', 'keywords']);
    config = result;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('linkedin.com')) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (error) {
            console.log("Content script not found, injecting now...");
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                await new Promise(r => setTimeout(r, 200));
            } catch (injectError) {
                console.error("Injection failed:", injectError);
                extractionRunning = false;
                await chrome.storage.local.set({ isRunning: false });
                safeSendMessage({
                    action: 'status_update',
                    text: 'Cannot access this page. Try refreshing.',
                    type: 'error'
                });
                return;
            }
        }

        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'begin_scroll_and_extract',
                keywords: config.keywords,
                performSearch: true
            });
        } catch (msgError) {
            console.error("Final message failed:", msgError);
            extractionRunning = false;
            await chrome.storage.local.set({ isRunning: false });
            safeSendMessage({
                action: 'status_update',
                text: 'Extraction failed to start.',
                type: 'error'
            });
        }
    } else {
        extractionRunning = false;
        await chrome.storage.local.set({ isRunning: false });
        safeSendMessage({
            action: 'status_update',
            text: 'Please open LinkedIn first.',
            type: 'error'
        });
    }
}

function stopExtraction() {
    extractionRunning = false;
    chrome.storage.local.set({ isRunning: false });

    if (stats.found > 0 || stats.saved > 0) {
        logActivityToBackend(stats.saved).catch(console.error);
    }
}

async function processExtractedData(dataList) {
    if (!extractionRunning) return;

    let baseUrl = config.apiUrl || API_BASE_URL;
    if (!baseUrl.includes('/api')) {
        baseUrl = baseUrl.replace(/\/$/, "") + "/api";
    }

    const currentStore = await chrome.storage.local.get(['extractionResults']);
    const currentResults = currentStore.extractionResults || [];
    const newResults = [...currentResults, ...dataList];
    await chrome.storage.local.set({ extractionResults: newResults });

    for (const item of dataList) {
        stats.found++;

        const name = (item.name || 'Unknown').substring(0, 100);
        const company = (item.company || '').substring(0, 100);
        const location = (item.location || '').substring(0, 100);
        const linkedin_id = (item.linkedin_id || '').substring(0, 100);

        try {
            const contactPayload = {
                full_name: name,
                email: item.email || null,
                phone: item.phone || null,
                linkedin_id: linkedin_id || null,
                company_name: company || null,
                location: location || null,
                source_email: config.sourceEmail || null
            };

            const response = await fetch(`${baseUrl}/vendor_contact`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(contactPayload)
            });

            if (response.ok) {
                stats.saved++;
            } else if (response.status === 400) {
                const errText = await response.text();
                if (errText.includes("Duplicate") || errText.includes("integrity")) {
                    console.log(`Skipping duplicate contact: ${name}`);
                } else {
                    console.error(`Failed to save contact (400): ${errText}`);
                }
            } else {
                const errText = await response.text();
                if (response.status === 409) {
                    console.log(`Skipping duplicate contact (409): ${name}`);
                } else {
                    console.error(`Failed to save contact: ${response.status} ${response.statusText}`, errText);
                }
            }
        } catch (error) {
            console.error("Error saving contact:", error.message);
        }

        safeSendMessage({ action: 'update_stats', stats: stats });
        chrome.storage.local.set({ stats: stats });
    }
}

async function logActivityToBackend(count) {
    if (!config.apiToken || !config.employeeId) return;

    let baseUrl = config.apiUrl || API_BASE_URL;
    if (!baseUrl.includes('/api')) {
        baseUrl = baseUrl.replace(/\/$/, "") + "/api";
    }
    const storageData = await chrome.storage.local.get(['extractionResults']);
    const csvContent = generateCSV(storageData.extractionResults || []);

    try {
        const jobTypeId = await getJobTypeId(baseUrl);
        if (!jobTypeId) {
            console.error("Job type 'extension_linkedin_post_contact_extractor' not found");
            return;
        }

        const payload = {
            job_id: jobTypeId,
            employee_id: parseInt(config.employeeId),
            activity_count: count,
            candidate_id: config.candidateId && config.candidateId !== '0' ? parseInt(config.candidateId) : null,
            notes: `Extracted via Chrome Extension. Source: ${config.sourceEmail || 'N/A'}. Keywords: ${config.keywords}\n\n--- CSV DATA ---\n${csvContent}`,
            activity_date: new Date().toISOString().split('T')[0]
        };

        const response = await fetch(`${baseUrl}/job_activity_logs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("Activity logged successfully");
            safeSendMessage({ action: 'extraction_finished', stats: stats });
        } else {
            console.error("Failed to log activity:", await response.text());
        }
    } catch (error) {
        console.error("Error logging activity:", error.message);
    }
}

async function getJobTypeId(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/job-types`, {
            headers: { 'Authorization': `Bearer ${config.apiToken}` }
        });
        const jobTypes = await response.json();
        const job = jobTypes.find(j => j.unique_id === 'extension_linkedin_post_contact_extractor');
        return job ? job.id : null;
    } catch (e) {
        console.error("Error fetching job type:", e.message);
        return null;
    }
}

function generateCSV(data) {
    if (!data || !data.length) return "";
    const headers = ["Name", "Email", "Phone", "Company", "Location", "LinkedIn ID", "Profile URL", "Source"];
    const rows = data.map(item => [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.email || '').replace(/"/g, '""')}"`,
        `"${(item.phone || '').replace(/"/g, '""')}"`,
        `"${(item.company || '').replace(/"/g, '""')}"`,
        `"${(item.location || '').replace(/"/g, '""')}"`,
        `"${(item.linkedin_id || '').replace(/"/g, '""')}"`,
        `"${(item.profileUrl || item.url || '').replace(/"/g, '""')}"`,
        `"${(config.sourceEmail || '').replace(/"/g, '""')}"`
    ].join(","));
    return [headers.join(","), ...rows].join("\n");
}
