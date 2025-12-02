// Background script for LinkedIn Auto Connector
let isRunning = false;
let currentProcess = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);
  
  if (message.action === 'startAutoConnect') {
    startAutoConnectProcess(message);
  } else if (message.action === 'stopAutoConnect') {
    stopAutoConnectProcess();
  }
  
  return true;
});

function stopAutoConnectProcess() {
  console.log('Stopping auto-connect process');
  isRunning = false;
  currentProcess = null;
}

async function startAutoConnectProcess({ contacts, delay, message, tabId }) {
  if (isRunning) {
    console.log('Auto-connect process is already running');
    return;
  }

  isRunning = true;
  currentProcess = { contacts, delay, message, tabId };
  
  let sentCount = 0;
  let failedCount = 0;
  const results = [];

  await initializeLog();

  try {
    for (let i = 0; i < contacts.length; i++) {
      if (!isRunning) break;

      const contact = contacts[i];
      const logEntry = {
        contactName: contact.contactName,
        linkedInUrl: contact.linkedInUrl,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      try {
        sendMessageToPopup({
          action: 'updateProgress',
          current: i + 1,
          total: contacts.length,
          status: `Processing: ${contact.contactName}`
        });

        console.log(`Processing: ${contact.contactName}`);
        const result = await processContact(contact, message, tabId);
        
        if (result && result.success) {
          sentCount++;
          logEntry.status = 'success';
          logEntry.message = 'Connection sent successfully';
        } else {
          failedCount++;
          logEntry.status = 'failed';
          logEntry.error = result ? result.error : 'Unknown error';
        }

      } catch (error) {
        failedCount++;
        logEntry.status = 'error';
        logEntry.error = error.message;
      }

      results.push(logEntry);
      await logResult(logEntry);

      if (i < contacts.length - 1 && isRunning) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    sendMessageToPopup({
      action: 'completed',
      sent: sentCount,
      failed: failedCount,
      total: contacts.length,
      results: results
    });

  } catch (error) {
    console.error('Auto-connect process failed:', error);
    sendMessageToPopup({
      action: 'error',
      error: error.message
    });
  } finally {
    isRunning = false;
    currentProcess = null;
  }
}

function sendMessageToPopup(message) {
  try {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        console.log('Message to popup failed:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.log('Error sending message:', error);
  }
}

async function processContact(contact, message, tabId) {
  return new Promise(async (resolve, reject) => {
    try {
      const profileUrl = contact.linkedInUrl || null;
      if (!profileUrl) {
        console.warn('No LinkedIn URL provided for contact:', contact);
        resolve({ success: false, error: 'No LinkedIn URL provided' });
        return;
      }

      console.log(`Navigating to internal ID URL: ${profileUrl}`);
      await chrome.tabs.update(tabId, { url: profileUrl });
      
      await waitForPageLoad(tabId);
      console.log('Page loaded, waiting extra time for LinkedIn processing...');
      
      // ADD THIS EXTRA DELAY for LinkedIn to process the redirect
      await new Promise(resolve => setTimeout(resolve, 5000));

      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: enhancedClickConnectButton,
        args: [message, contact.contactName, true],
        world: 'MAIN'
      });

      if (results && results[0] && results[0].result) {
        const res = results[0].result;
        resolve(res);
      } else {
        resolve({ success: false, error: 'No result from content script' });
      }

    } catch (error) {
      console.error(`Error processing ${contact.contactName}:`, error);
      reject(error);
    }
  });
}
async function waitForPageLoad(tabId, timeout = 40000) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let redirectCount = 0;
    
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId) {
        if (info.status === 'loading') {
          redirectCount++;
          console.log(`Page redirect detected: ${redirectCount}`);
        }
        
        if (info.status === 'complete') {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timeoutId);
            // INCREASED WAIT TIME for LinkedIn redirects
            console.log('Page complete, waiting for LinkedIn redirect...');
            setTimeout(() => resolve(), 10000); // Increased from 5000 to 10000ms
          }
        }
      }
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        console.log('Page load timeout, continuing anyway...');
        resolve();
      }
    }, timeout);

    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete' && !resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
        console.log('Tab already complete, waiting for redirect...');
        setTimeout(() => resolve(), 10000);
      }
    });
  });
}

async function initializeLog() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logKey = `linkedin_connector_log_${timestamp}`;
  await chrome.storage.local.set({ 
    currentLogKey: logKey,
    [logKey]: []
  });
}

async function logResult(logEntry) {
  try {
    const { currentLogKey } = await chrome.storage.local.get(['currentLogKey']);
    if (currentLogKey) {
      const { [currentLogKey]: currentLog = [] } = await chrome.storage.local.get([currentLogKey]);
      currentLog.push(logEntry);
      await chrome.storage.local.set({ [currentLogKey]: currentLog });
    }
  } catch (error) {
    console.error('Error logging result:', error);
  }
}

// ENHANCED FUNCTION TO HANDLE SHADOW DOM
function enhancedClickConnectButton(customMessage, contactName, debugDump = false) {
  // Self-contained function: define helpers inside so this whole function can be injected into the page
  return new Promise((resolve) => {
    console.log('Starting enhanced Connect flow (self-contained for injection)...');

    // Helper: check visibility & viewport
    function isElementClickable_local(element) {
      if (!element) return false;
      try {
        const style = window.getComputedStyle(element);
        const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.offsetWidth > 0 && element.offsetHeight > 0;
        const isEnabled = !element.disabled;
        const rect = element.getBoundingClientRect();
        const inViewport = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);
        return isVisible && isEnabled && inViewport;
      } catch (err) {
        return false;
      }
    }

    // Recursive traversal to find Connect button
    function findConnectButtonDeep_local() {
      const visited = new Set();

      function* traverse(root) {
        if (!root || visited.has(root)) return;
        visited.add(root);
        yield root;
        const elems = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const el of elems) {
          try {
            if (el.shadowRoot) yield* traverse(el.shadowRoot);
          } catch (e) {}
        }
      }

      for (const root of traverse(document)) {
        try {
          // Match any element (buttons, anchors, or elements with aria-label) that mentions connect/invite
          const ariaSelector = 'button[aria-label*="connect" i], button[aria-label*="invite" i], a[aria-label*="connect" i], a[aria-label*="invite" i], [role="button"][aria-label*="connect" i], [role="button"][aria-label*="invite" i], [aria-label*="connect" i], [aria-label*="invite" i]';
          const ariaMatches = root.querySelectorAll ? root.querySelectorAll(ariaSelector) : [];
          for (const btn of ariaMatches) if (isElementClickable_local(btn)) return btn;

          // Also consider anchors as clickable controls (LinkedIn often uses <a> for invite links)
          const btns = root.querySelectorAll ? root.querySelectorAll('button, a, [role="button"]') : [];
          for (const b of btns) {
            const t = (b.textContent || '').trim();
            if (/^connect$/i.test(t) || /\bconnect\b/i.test(t)) if (isElementClickable_local(b)) return b;
          }

          const fallback = root.querySelectorAll ? root.querySelectorAll('a, div, span') : [];
          for (const el of fallback) {
            const txt = (el.textContent || '').trim();
            if (/^connect$/i.test(txt) || /\bconnect\b/i.test(txt)) {
              let parent = el;
              while (parent && parent !== document) {
                if ((parent.tagName === 'BUTTON' || (parent.getAttribute && parent.getAttribute('role') === 'button')) && isElementClickable_local(parent)) return parent;
                parent = parent.parentElement;
              }
            }
          }
        } catch (err) {
          // continue
        }
      }
      return null;
    }

    function findOverflowButtonDeep_local() {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        const candidates = Array.from(root.querySelectorAll('button, a, div[role="button"]'));
        for (const c of candidates) {
          const label = (c.getAttribute && (c.getAttribute('aria-label') || c.getAttribute('title'))) || '';
          const txt = (c.textContent || '').trim();
          if (/more( actions)?|more options|more actions on profile/i.test(label) || /…|\.\.\.|More|More actions/i.test(txt)) {
            if (isElementClickable_local(c)) return c;
          }
        }
      }
      return null;
    }

    function findMenuConnectItemDeep_local() {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        const items = Array.from(root.querySelectorAll('[role="menuitem"], li, button, a, div[role="button"]'));
        for (const item of items) {
          const text = (item.textContent || '').trim();
          const aria = (item.getAttribute && (item.getAttribute('aria-label') || item.getAttribute('title'))) || '';
          const dataAttrs = (item.getAttribute && (item.getAttribute('data-control-name') || item.getAttribute('data-test-id') || '')) || '';
          // Check text, aria-label/title, or common LinkedIn data attributes for 'Connect' or 'Invite'
          if (/^Connect$/i.test(text) || /\bConnect\b/i.test(text) || /connect/i.test(aria) || /invite/i.test(aria) || /connect/i.test(dataAttrs)) {
            if (isElementClickable_local(item)) return item;
          }
        }
      }
      return null;
    }

    function findModalDeep_local() {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        const modal = root.querySelector('div[role="dialog"], .artdeco-modal, .send-invite');
        if (modal && isElementVisible_local(modal)) return modal;
      }
      return null;
    }

    function isElementVisible_local(element) {
      if (!element) return false;
      try {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
      } catch (e) { return false; }
    }

    function addNoteToModalDeep_local(message) {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        // Prefer explicit textarea id/class, then fall back to common attributes
        const noteField = root.querySelector('#custom-message, textarea.connect-button-send-invite__custom-message, textarea[name="message"], textarea[placeholder*="note"], textarea[aria-label*="message"]');
        if (noteField && isElementVisible_local(noteField)) {
          try { noteField.focus(); } catch (e) {}
          // limit to 200 characters
          const trimmed = (message || '').toString().slice(0, 200);
          try {
            if (noteField.isContentEditable) {
              noteField.innerText = trimmed;
              noteField.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
            } else {
              noteField.value = trimmed;
              noteField.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }));
              noteField.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
          } catch (e) {
            try { noteField.setAttribute('value', trimmed); noteField.dispatchEvent(new Event('input', { bubbles: true, composed: true })); } catch (e2) {}
          }
          return true;
        }
      }
      return false;
    }

    // Find and return the 'Add a note' button inside the modal/menu
    function findAddNoteButtonDeep_local() {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        // match by aria-label or visible text
        const btns = Array.from(root.querySelectorAll('button, [role="button"]'));
        for (const b of btns) {
          const aria = (b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) || '';
          const txt = (b.textContent || '').trim();
          if (/add a note/i.test(aria) || /^Add a note$/i.test(txt) || /add a note/i.test(txt)) {
            if (isElementClickable_local(b)) return b;
          }
        }
      }
      return null;
    }

    function findSendButtonDeep_local() {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);
      for (const root of roots) {
        // Match aria-labels like "Send" or "Send invitation" (case-insensitive) and buttons with visible text
        let sendButton = null;
        try {
          sendButton = root.querySelector('button[aria-label*="send" i], button[aria-label*="send invitation" i], [role="button"][aria-label*="send" i]');
        } catch (e) {
          // some older environments may not support the i flag; fall back to case-sensitive check
          sendButton = root.querySelector('button[aria-label*="Send"], button[aria-label*="Send invitation"], [role="button"][aria-label*="Send"]');
        }
        if (sendButton && isElementClickable_local(sendButton)) return sendButton;
        const buttons = root.querySelectorAll ? root.querySelectorAll('button') : [];
        for (const button of buttons) {
          const text = (button.textContent || '').trim();
          if ((/^Send$/i.test(text) || /Send invitation/i.test(text)) && isElementClickable_local(button)) return button;
        }
      }
      return null;
    }

    function clickSendButtonDeep_local() {
      return new Promise((resolveClick) => {
        let attempts = 0;
        const max = 6;
        const loop = () => {
          attempts++;
          const btn = findSendButtonDeep_local();
          if (btn) {
            try { btn.click(); } catch (e) {
              try {
                btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
                btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
              } catch (e2) { /* ignore */ }
            }
            setTimeout(() => resolveClick({ success: true }), 2500);
            return;
          }
          if (attempts < max) setTimeout(loop, 1000); else resolveClick({ success: false, error: 'Send button not found' });
        };
        loop();
      });
    }

    function collectCandidates_local(limit = 10) {
      const roots = [document];
      const all = document.querySelectorAll('*');
      for (const el of all) if (el.shadowRoot) roots.push(el.shadowRoot);

      const mapEl = (el) => {
        try {
          return {
            tag: el.tagName,
            text: (el.textContent || '').trim().slice(0, 120),
            aria: (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '',
            data: (el.getAttribute && (el.getAttribute('data-control-name') || el.getAttribute('data-test-id') || '')) || ''
          };
        } catch (e) { return { tag: el.tagName || 'unknown' }; }
      };

      const connectCandidates = [];
      const overflowCandidates = [];
      const menuCandidates = [];
      const sendCandidates = [];

      for (const root of roots) {
        try {
          const btns = root.querySelectorAll ? Array.from(root.querySelectorAll('button, [role="button"], a, li, div')) : [];
          for (const b of btns) {
            const text = (b.textContent || '').trim();
            const aria = (b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) || '';
            const data = (b.getAttribute && (b.getAttribute('data-control-name') || b.getAttribute('data-test-id') || '')) || '';
            if (/connect/i.test(text) || /connect/i.test(aria) || /connect/i.test(data)) {
              connectCandidates.push(mapEl(b));
            }
            if (/more( actions)?|more options|\u2026|\.\.\.|more actions/i.test(text) || /more( actions)?|more options|\u2026|\.\.\./i.test(aria)) {
              overflowCandidates.push(mapEl(b));
            }
            if (/send/i.test(text) || /send invitation/i.test(text) || /send/i.test(aria)) {
              sendCandidates.push(mapEl(b));
            }
            // menu-like items
            if ((b.getAttribute && b.getAttribute('role') === 'menuitem') || /menuitem|li/i.test(b.tagName)) {
              menuCandidates.push(mapEl(b));
            }
            if (connectCandidates.length + overflowCandidates.length + menuCandidates.length + sendCandidates.length > limit) break;
          }
        } catch (e) {}
        if (connectCandidates.length + overflowCandidates.length + menuCandidates.length + sendCandidates.length > limit) break;
      }

      return {
        connectCandidates: connectCandidates.slice(0, limit),
        overflowCandidates: overflowCandidates.slice(0, limit),
        menuCandidates: menuCandidates.slice(0, limit),
        sendCandidates: sendCandidates.slice(0, limit)
      };
    }

    function handleConnectionModal_local(customMessage, contactNameLocal) {
      return new Promise((resolveModal) => {
        let attempts = 0;
        const max = 8;
        const loop = async () => {
          attempts++;
          const modal = findModalDeep_local();
          if (modal) {
            const addBtn = findAddNoteButtonDeep_local();
            if (addBtn) {
              try { addBtn.click(); } catch (e) {
                try {
                  addBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
                  addBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
                  addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                } catch (e2) { /* ignore */ }
              }
              await new Promise(r => setTimeout(r, 400));
            }

            const defaultTemplate = "Hi {{name}}, As a GenAI enthusiast with relevant skills, I'd appreciate connecting to explore opportunities and learn from your experience.";            let noteText = (customMessage && customMessage.trim()) ? customMessage.trim() : defaultTemplate;
            const nameToUse = (contactNameLocal || '').toString();
            noteText = noteText.replace(/\{\{\s*name\s*\}\}/gi, nameToUse).replace(/\{\{\s*contactName\s*\}\}/gi, nameToUse);

            addNoteToModalDeep_local(noteText);

            // Click send (or 'Send without a note' if no textarea found) after a short delay
            setTimeout(() => { clickSendButtonDeep_local().then(resolveModal); }, 1000);
            return;
          }
          if (attempts < max) setTimeout(loop, 800); else resolveModal({ success: false, error: 'Connection modal not found' });
        };
        loop();
      });
    }

    // Main repeated attempts
    let attempts = 0;
    const maxAttempts = 12;

    const attemptClick = async () => {
      attempts++;
      try {
        const connectButton = findConnectButtonDeep_local();
          if (connectButton) {
          connectButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 400));
          try { connectButton.click(); } catch (e) {
            try {
              connectButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
              connectButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
              connectButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            } catch (e2) { /* ignore */ }
          }
          setTimeout(() => handleConnectionModal_local(customMessage, contactName).then(resolve), 1400);
          return;
        }

        const overflow = findOverflowButtonDeep_local();
        if (overflow) {
          try { overflow.click(); } catch (e) {
            try {
              overflow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
              overflow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
              overflow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            } catch (e2) { /* ignore */ }
          }
          let menuItem = null;
          for (let mi = 0; mi < 8; mi++) {
            await new Promise(r => setTimeout(r, 250));
            menuItem = findMenuConnectItemDeep_local();
            if (menuItem) break;
          }
          if (menuItem) {
            console.log('Found menu Connect after opening overflow');
            try { menuItem.click(); } catch (e) {
              try {
                menuItem.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
                menuItem.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, composed: true }));
                menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
              } catch (e2) { /* ignore */ }
            }
            setTimeout(() => handleConnectionModal_local(customMessage, contactName).then(resolve), 1200);
            return;
          }
        }

      } catch (err) {
        console.error('Error during connect attempt (injected):', err);
      }
      if (attempts < maxAttempts) {
        setTimeout(attemptClick, 1200);
      } else {
        const debugInfo = debugDump ? collectCandidates_local(12) : undefined;
        if (debugDump) console.warn('Connect action not found — debug candidates:', debugInfo);
        resolve({ success: false, error: 'Connect action not found', debug: debugInfo });
      }
    };

    attemptClick();
  });
}


