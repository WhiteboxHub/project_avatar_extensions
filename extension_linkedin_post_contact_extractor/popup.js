// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const employeeIdInput = document.getElementById('employee-id');
    const candidateIdInput = document.getElementById('candidate-id');
    const sourceEmailInput = document.getElementById('source-email'); // New field
    const apiUrlInput = document.getElementById('api-url');
    const apiTokenInput = document.getElementById('api-token');
    const keywordsInput = document.getElementById('keywords');
    const saveBtn = document.getElementById('save-config');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusMsg = document.getElementById('status-msg');
    const statsPanel = document.getElementById('stats-panel');
    const countFound = document.getElementById('count-found');
    const countSaved = document.getElementById('count-saved');

    // Load saved config
    chrome.storage.local.get(['employeeId', 'candidateId', 'sourceEmail', 'apiUrl', 'apiToken', 'keywords', 'isRunning', 'stats'], (result) => {
        if (result.employeeId) employeeIdInput.value = result.employeeId;
        if (result.candidateId) candidateIdInput.value = result.candidateId;
        if (result.sourceEmail) sourceEmailInput.value = result.sourceEmail; // Load saved email
        if (result.apiUrl) apiUrlInput.value = result.apiUrl;
        if (result.apiToken) apiTokenInput.value = result.apiToken;
        if (result.keywords) keywordsInput.value = result.keywords;

        if (result.isRunning) {
            updateUI(true);
        }

        if (result.stats) {
            countFound.innerText = result.stats.found || 0;
            countSaved.innerText = result.stats.saved || 0;
            statsPanel.style.display = 'flex';
        }
    });

    saveBtn.addEventListener('click', () => {
        const config = {
            employeeId: employeeIdInput.value.trim(),
            candidateId: candidateIdInput.value.trim(),
            sourceEmail: sourceEmailInput.value.trim(), 
            apiUrl: apiUrlInput.value.trim() || 'http://localhost:8000',
            apiToken: apiTokenInput.value.trim(),
            keywords: keywordsInput.value.trim()
        };

        if (!config.employeeId) {
            showStatus('Employee ID is required', 'error');
            return;
        }

        if (!config.apiToken) {
            showStatus('API Token is required for logging', 'error');
            return;
        }

        chrome.storage.local.set(config, () => {
            showStatus('Configuration saved!', 'success');
        });
    });

    startBtn.addEventListener('click', () => {
        chrome.storage.local.get(['employeeId', 'apiToken'], (result) => {
            if (!result.employeeId || !result.apiToken) {
                showStatus('Set ID and Token first', 'error');
                return;
            }

            updateUI(true);
            showStatus('Extraction started...', 'info');

            chrome.storage.local.set({ stats: { found: 0, saved: 0 } });
            countFound.innerText = '0';
            countSaved.innerText = '0';
            statsPanel.style.display = 'flex';

            chrome.runtime.sendMessage({ action: 'start_extraction' });
        });
    });

    stopBtn.addEventListener('click', () => {
        updateUI(false);
        showStatus('Extraction stopped', 'info');
        chrome.runtime.sendMessage({ action: 'stop_extraction' });
    });

    const downloadBtn = document.getElementById('download-csv');
    downloadBtn.addEventListener('click', () => {
        chrome.storage.local.get(['extractionResults'], (result) => {
            if (result.extractionResults && result.extractionResults.length > 0) {
                downloadResults(result.extractionResults);
            } else {
                showStatus('No data to download yet.', 'info');
            }
        });
    });

    function downloadResults(results) {
        const headers = ["Name", "Email", "Phone", "Profile URL", "Location", "Company", "Extraction Date"];
        const rows = results.map(item => [
            `"${(item.name || '').replace(/"/g, '""')}"`,
            `"${(item.email || '').replace(/"/g, '""')}"`,
            `"${(item.phone || '').replace(/"/g, '""')}"`,
            `"${(item.profile_url || '').replace(/"/g, '""')}"`,
            `"${(item.location || '').replace(/"/g, '""')}"`,
            `"${(item.company || '').replace(/"/g, '""')}"`,
            new Date().toLocaleDateString()
        ]);

        const csvContent = headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `WBL_LinkedIn_Leads_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'update_stats') {
            statsPanel.style.display = 'flex';
            countFound.innerText = message.stats.found;
            countSaved.innerText = message.stats.saved;
            if (message.stats.found > 0) {
                showStatus(`Found ${message.stats.found} leads so far!`, 'success');
            }
        } else if (message.action === 'extraction_finished') {
            updateUI(false);
            showStatus('Finished logging activity!', 'success');
        } else if (message.action === 'status_update') {
            showStatus(message.text, message.type || 'info');
            if (message.type === 'error') {
                updateUI(false);
            }
        }
    });

    setInterval(() => {
        chrome.storage.local.get(['isRunning', 'stats', 'keywords'], (res) => {
            if (res.isRunning && (!res.stats || res.stats.found === 0)) {
                showStatus('Searching... try clearing Keywords if 0 results.', 'info');
            }
        });
    }, 10000);

    function updateUI(isRunning) {
        startBtn.style.display = isRunning ? 'none' : 'block';
        stopBtn.style.display = isRunning ? 'block' : 'none';
        chrome.storage.local.set({ isRunning });
    }

    function showStatus(text, type) {
        statusMsg.innerText = text;
        statusMsg.className = 'status ' + type;
    }
});
