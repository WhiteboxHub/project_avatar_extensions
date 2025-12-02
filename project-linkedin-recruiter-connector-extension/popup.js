document.addEventListener('DOMContentLoaded', function() {
  const jsonFileInput = document.getElementById('jsonFile');
  const connectionMessage = document.getElementById('connectionMessage');
  const delayInput = document.getElementById('delay');
  const maxConnectionsInput = document.getElementById('maxConnections');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const downloadLogsBtn = document.getElementById('downloadLogs');
  const progressText = document.getElementById('progressText');
  const statusDiv = document.getElementById('status');

  let contacts = [];
  let isRunning = false;

  // Set minimum delay to 15 seconds
  delayInput.value = 15;
  delayInput.min = 15;

  // Load saved settings
  loadSavedSettings();

  // Load JSON file
  jsonFileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const parsedData = JSON.parse(e.target.result);
        
        // Handle different JSON structures
        if (Array.isArray(parsedData)) {
          contacts = parsedData;
        } else if (parsedData.contacts && Array.isArray(parsedData.contacts)) {
          contacts = parsedData.contacts;
        } else if (typeof parsedData === 'object') {
          contacts = Object.values(parsedData);
        } else {
          throw new Error('Invalid JSON structure');
        }
        
        // Normalize and validate contacts: only accept entries that provide a real `linkedInUrl`.
        // Per request, do NOT construct the URL from `linkedin_internal_id` — use the provided `linkedInUrl` field.
        contacts = contacts.map(c => Object.assign({}, c))
                           .filter(contact => contact.linkedInUrl && typeof contact.linkedInUrl === 'string' && contact.linkedInUrl.trim() !== '');
        
        if (contacts.length === 0) {
          throw new Error('No valid contacts found in JSON');
        }
        
        showStatus(`Loaded ${contacts.length} contacts`, 'success');
        updateProgress(0, contacts.length, 'Ready to start');
        saveSettings();
      } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
        console.error('JSON Parse Error:', error);
        contacts = [];
      }
    };
    reader.onerror = function() {
      showStatus('Error reading file', 'error');
      contacts = [];
    };
    reader.readAsText(file);
  });

  // Save settings when inputs change
  connectionMessage.addEventListener('input', saveSettings);
  delayInput.addEventListener('input', saveSettings);
  maxConnectionsInput.addEventListener('input', saveSettings);

  // Start auto-connecting
  startBtn.addEventListener('click', async function() {
    if (contacts.length === 0) {
      showStatus('Please load a valid JSON file first', 'error');
      return;
    }

    const delay = parseInt(delayInput.value);
    if (delay < 15) {
      showStatus('Delay must be at least 15 seconds to avoid LinkedIn limits', 'error');
      return;
    }

    isRunning = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    downloadLogsBtn.disabled = true;
    
    const maxConnections = Math.min(parseInt(maxConnectionsInput.value), contacts.length);
    const contactsToProcess = contacts.slice(0, maxConnections);
    
    try {
      // Check if we're on LinkedIn
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url.includes('linkedin.com')) {
        showStatus('Please navigate to LinkedIn.com in this tab first', 'error');
        resetUI();
        return;
      }

      console.log('Starting auto-connect with:', {
        contacts: contactsToProcess.length,
        delay: delay * 1000,
        tabId: tab.id
      });

      // Start the process through background script
      chrome.runtime.sendMessage({
        action: 'startAutoConnect',
        contacts: contactsToProcess,
        delay: delay * 1000,
        message: connectionMessage.value.trim(),
        tabId: tab.id
      });

      showStatus(`Started! Processing ${contactsToProcess.length} contacts with ${delay}s delay`, 'processing');

    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
      resetUI();
    }
  });

  // Stop auto-connecting
  stopBtn.addEventListener('click', function() {
    console.log('Stop button clicked');
    chrome.runtime.sendMessage({ action: 'stopAutoConnect' });
    showStatus('Stopping...', 'error');
    resetUI();
  });

  // Download logs
  downloadLogsBtn.addEventListener('click', function() {
    downloadLogs();
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message) => {
    console.log('Popup received message:', message.action);
    
    if (message.action === 'updateProgress') {
      updateProgress(message.current, message.total, message.status);
    } else if (message.action === 'completed') {
      showStatus(`Completed! Sent: ${message.sent}, Failed: ${message.failed}`, 'success');
      resetUI();
    } else if (message.action === 'error') {
      showStatus(`Error: ${message.error}`, 'error');
      resetUI();
    }
  });

  function updateProgress(current, total, status = '') {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    progressText.textContent = `Progress: ${current}/${total} (${percentage}%) ${status}`;
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type !== 'processing') {
      setTimeout(() => {
        if (!isRunning) {
          statusDiv.style.display = 'none';
        }
      }, 5000);
    }
  }

  function resetUI() {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    downloadLogsBtn.disabled = false;
    isRunning = false;
  }

  async function loadSavedSettings() {
    try {
      const settings = await chrome.storage.local.get([
        'connectionMessage', 
        'delay', 
        'maxConnections'
      ]);
      
      if (settings.connectionMessage) {
        connectionMessage.value = settings.connectionMessage;
      }
      if (settings.delay) {
        delayInput.value = Math.max(15, parseInt(settings.delay));
      }
      if (settings.maxConnections) {
        maxConnectionsInput.value = settings.maxConnections;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  function saveSettings() {
    const settings = {
      connectionMessage: connectionMessage.value,
      delay: delayInput.value,
      maxConnections: maxConnectionsInput.value
    };
    
    chrome.storage.local.set(settings).catch(error => {
      console.error('Error saving settings:', error);
    });
  }

  function downloadLogs() {
    chrome.storage.local.get(null).then(allData => {
      const logKeys = Object.keys(allData).filter(key => key.startsWith('linkedin_connector_log_'));
      
      if (logKeys.length === 0) {
        showStatus('No logs found', 'error');
        return;
      }

      let allLogs = [];
      logKeys.forEach(key => {
        if (allData[key] && Array.isArray(allData[key])) {
          allLogs = allLogs.concat(allData[key]);
        }
      });

      if (allLogs.length === 0) {
        showStatus('No connection data found', 'error');
        return;
      }

      const csvContent = convertToCSV(allLogs);
      downloadCSV(csvContent, `linkedin_connections_${new Date().toISOString().split('T')[0]}.csv`);
      showStatus(`Downloaded ${allLogs.length} records`, 'success');
    }).catch(error => {
      showStatus('Error downloading logs', 'error');
      console.error(error);
    });
  }

  function convertToCSV(logs) {
    const headers = ['Timestamp', 'Contact Name', 'LinkedIn URL', 'Status', 'Message/Error'];
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const row = [
        `"${(log.timestamp || '').replace(/"/g, '""')}"`,
        `"${(log.contactName || '').replace(/"/g, '""')}"`,
        `"${(log.linkedInUrl || '').replace(/"/g, '""')}"`,
        `"${(log.status || '').replace(/"/g, '""')}"`,
        `"${((log.message || log.error || '')).replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});