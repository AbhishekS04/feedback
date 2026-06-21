(async () => {
  // Inject AJAX response interceptor into the page context
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // Intercept Fetch
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0] ? (typeof args[0] === 'string' ? args[0] : args[0].url) : '';
        try {
          const response = await originalFetch(...args);
          if (url.includes('update-biometric') || url.includes('refreshAttendanceStatus')) {
            const clone = response.clone();
            window.dispatchEvent(new CustomEvent('adamas-bot-sync-resp', {
              detail: { url, status: clone.status, ok: clone.ok }
            }));
          }
          return response;
        } catch (err) {
          if (url.includes('update-biometric') || url.includes('refreshAttendanceStatus')) {
            window.dispatchEvent(new CustomEvent('adamas-bot-sync-resp', {
              detail: { url, status: 0, ok: false, error: err.message }
            }));
          }
          throw err;
        }
      };

      // Intercept XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalOpen.apply(this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
          if (this._url && (this._url.includes('update-biometric') || this._url.includes('refreshAttendanceStatus'))) {
            window.dispatchEvent(new CustomEvent('adamas-bot-sync-resp', {
              detail: { url: this._url, status: this.status, ok: this.status >= 200 && this.status < 300 }
            }));
          }
        });
        this.addEventListener('error', function() {
          if (this._url && (this._url.includes('update-biometric') || this._url.includes('refreshAttendanceStatus'))) {
            window.dispatchEvent(new CustomEvent('adamas-bot-sync-resp', {
              detail: { url: this._url, status: this.status, ok: false }
            }));
          }
        });
        return originalSend.apply(this, args);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Tally state for intercepted biometric synchronization pings
  let syncSuccessCount = 0;
  let syncFailCount = 0;

  window.addEventListener('adamas-bot-sync-resp', (e) => {
    const { ok } = e.detail;
    if (ok) {
      syncSuccessCount++;
    } else {
      syncFailCount++;
    }
  });

  // Global configurations
  const DELAY_AFTER_SUBMIT_MS = 4000;
  const DELAY_AFTER_NAV_MS    = 2500;
  const DELAY_AFTER_ERROR_MS  = 3000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function waitForElement(selector, maxRetries = 20, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(interval);
    }
    return null;
  }

  async function waitForElements(selector, minCount = 1, maxRetries = 20, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const els = document.querySelectorAll(selector);
      if (els && els.length >= minCount) return Array.from(els);
      await sleep(interval);
    }
    return [];
  }

  function findVisibleInput(selector) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled) {
        return el;
      }
    }
    return null;
  }

  function findVisibleUsernameInput() {
    const explicitSelectors = [
      'input[name*="username"]',
      'input[name*="email"]',
      'input[name*="roll"]',
      'input[name*="reg"]',
      'input[name*="id"]',
      'input[placeholder*="Registration"]',
      'input[placeholder*="Username"]',
      'input[placeholder*="ID"]'
    ];
    for (const sel of explicitSelectors) {
      const el = findVisibleInput(sel);
      if (el) return el;
    }
    return findVisibleInput('input[type="text"]');
  }

  async function waitForVisibleElement(selector, maxRetries = 20, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const el = findVisibleInput(selector);
      if (el) return el;
      await sleep(interval);
    }
    return null;
  }

  async function waitForVisibleUsernameInput(maxRetries = 20, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      const el = findVisibleUsernameInput();
      if (el) return el;
      await sleep(interval);
    }
    return null;
  }

  async function waitForVisibleSubmitButton(maxRetries = 20, interval = 500) {
    for (let i = 0; i < maxRetries; i++) {
      let btn = findVisibleInput('button[type="submit"], input[type="submit"], button.btn-primary');
      if (btn) return btn;
      
      const buttons = Array.from(document.querySelectorAll('button, input[type="button"]'));
      btn = buttons.find(b => {
        const text = (b.innerText || b.value || '').toLowerCase();
        const style = window.getComputedStyle(b);
        return (text.includes('login') || text.includes('sign') || text.includes('submit')) && 
               style.display !== 'none' && style.visibility !== 'hidden' && b.offsetWidth > 0;
      });
      if (btn) return btn;
      await sleep(interval);
    }
    return null;
  }

  function fillInputSafely(element, text) {
    if (!element) return;
    element.focus();
    
    // Bypass framework value wrapper property descriptors (Livewire/React/Vue support)
    try {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      valueSetter.call(element, text);
    } catch (e) {
      element.value = text;
    }

    // Trigger full input/change event sequence
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Trigger keyboard simulation events
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: text.slice(-1) }));
    element.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: text.slice(-1) }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: text.slice(-1) }));
    
    element.blur();
  }

  // Determine current page status
  const url = window.location.href;
  const isLoginPage = url.includes('/student/login') || url.endsWith('/student/') || url.endsWith('/student') || (url.includes('/student') && !url.includes('/dashboard') && !url.includes('/give-feedback') && !url.includes('/attendance') && !!document.querySelector('input[type="password"]'));
  const isDashboard = url.includes('/student/dashboard');
  const isFeedbackForm = url.includes('/student/give-feedback');
  const isAttendance = url.includes('/student/attendance');

  // If not on the student portal, exit
  if (!url.toLowerCase().includes('adamasknowledgecity.ac.in/student')) return;

  // ── Create Shadow DOM for complete CSS isolation ──
  const host = document.createElement('div');
  host.id = 'adamas-feedback-bot-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject Stylesheet link
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content.css');
  shadow.appendChild(link);

  // Injected Panel HTML structure
  const panel = document.createElement('div');
  panel.className = 'bot-panel minimized'; // Minimized by default
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-brand">
        <div class="panel-logo">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
        </div>
        <div class="panel-title">
          <h4>ADAMAS</h4>
          <p>FEEDBACK BOT 🤠</p>
        </div>
      </div>
      <div class="panel-actions">
        <button class="icon-btn" id="btn-minimize" title="Minimize panel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    </div>

    <div class="panel-body">
      <!-- Live Session Status Badge -->
      <div id="live-session-status" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; background-color: var(--bg-card); border: 1px solid var(--bg-border); border-radius: 6px; padding: 6px 10px; font-size: 10px; font-weight: bold; font-family: monospace;">
        <span style="color: var(--text-muted);">SESSION STATUS:</span>
        <span id="session-badge" style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; transition: all 0.2s ease;">LOGGED OUT</span>
      </div>

      <!-- Credentials / Accounts section -->
      <div class="credentials-only" id="panel-credentials-section" style="border: 1px solid var(--bg-border); background-color: rgba(24, 24, 27, 0.3); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
        <h5 style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; color: var(--text-muted);">
          <span>COWBOY CREDENTIALS 🤠</span>
        </h5>
        
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 8px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Select Account</label>
          <div style="display: flex; gap: 6px; align-items: center; width: 100%;">
            <select id="panel-sel-account" style="background-color: var(--bg-card-solid); border: 1px solid var(--bg-border); border-radius: 6px; color: var(--text-primary); font-family: var(--font-sans); font-size: 10px; padding: 6px 8px; outline: none; cursor: pointer; flex-grow: 1; min-width: 0; height: 26px;"></select>
            <button id="panel-btn-delete-account" title="Delete selected account" style="background-color: #ef4444; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 9px; display: none; line-height: 1; flex-shrink: 0; height: 26px; align-items: center; justify-content: center;">🗑️</button>
          </div>
        </div>

        <div id="panel-new-account-inputs" style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 8px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Student ID</label>
            <input type="text" id="panel-txt-username" placeholder="AU/202X/XXXXXXX" style="background-color: var(--bg-card-solid); border: 1px solid var(--bg-border); border-radius: 6px; color: var(--text-primary); font-family: var(--font-sans); font-size: 10px; padding: 6px 8px; outline: none;">
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 8px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Password</label>
            <input type="password" id="panel-txt-password" placeholder="••••••••" style="background-color: var(--bg-card-solid); border: 1px solid var(--bg-border); border-radius: 6px; color: var(--text-primary); font-family: var(--font-sans); font-size: 10px; padding: 6px 8px; outline: none;">
          </div>
          <button id="panel-btn-save-account" style="background-color: var(--accent); color: var(--bg-dark); border: none; border-radius: 6px; font-family: var(--font-sans); font-size: 9px; font-weight: bold; padding: 6px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;">💾 Save & Select</button>
        </div>
      </div>

      <!-- Subjects / Progress Section -->
      <div class="dashboard-only" id="subject-scanning-section">
        <h5>PENDING SUBJECTS</h5>
        <div id="subject-list-container" style="font-size: 10px; color: var(--text-muted);">
          Scan dashboard to list subjects...
        </div>
      </div>

      <!-- Settings Section -->
      <div class="dashboard-only" id="settings-section">
        <h5>SELECT VIBE</h5>
        <div class="vibe-row">
          <div class="vibe-btn active" data-vibe="good">😇 GOOD</div>
          <div class="vibe-btn" data-vibe="neutral">😐 MEH</div>
          <div class="vibe-btn" data-vibe="bad">👿 BAD</div>
        </div>
        <div style="margin-top: 10px;">
          <label style="font-size: 9px; font-weight: 800; display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-muted);">
            <input type="checkbox" id="chk-sniper"> 🎯 SNIPER MODE (HANDPICK)
          </label>
        </div>
        <div class="sniper-container" id="sniper-list-panel" style="margin-top: 8px;">
          <div class="sniper-list" id="sniper-rows"></div>
        </div>
      </div>

      <!-- Live Terminal CLI console -->
      <div class="terminal-card">
        <div class="terminal-title-bar" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <h5 style="margin: 0;">LIVE SHELL OUTPUT</h5>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-copy-logs" title="Copy console logs" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 10px; display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; transition: all 0.2s ease;">📋 Copy</button>
            <button id="btn-clear-logs" title="Clear console logs" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 10px; display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; transition: all 0.2s ease;">🗑️ Clear</button>
            <div class="terminal-dots" style="display: flex; gap: 4px;">
              <div class="terminal-dot dot-red"></div>
              <div class="terminal-dot dot-yellow"></div>
              <div class="terminal-dot dot-green"></div>
            </div>
          </div>
        </div>
        <div class="terminal-screen" id="console-output">
          <div class="log-line system">> Shell loaded. Ready, partner! 🤠</div>
        </div>
      </div>

      <!-- Unified Progress Bar -->
      <div class="progress-container" id="bot-progress-row">
        <div class="progress-details">
          <span id="progress-text">Progress</span>
          <span id="progress-pct">0%</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" id="progress-fill"></div>
        </div>
      </div>
    </div>

    <div class="panel-controls">
      <button class="main-btn btn-start" id="btn-toggle-bot">
        <span>🤠 START FEEDBACK BOT</span>
      </button>
      <div class="secondary-btns">
        <button class="main-btn btn-secondary" id="btn-view-attendance">📊 ATTENDANCE</button>
        <button class="main-btn btn-secondary" id="btn-trigger-sync">⚡ BIO SYNC</button>
      </div>
    </div>
  `;

  // Launcher floating toggle button
  const launcher = document.createElement('div');
  launcher.className = 'bot-launcher';
  launcher.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  `;

  shadow.appendChild(panel);
  shadow.appendChild(launcher);

  // Injected modal for attendance
  const attModal = document.createElement('div');
  attModal.className = 'attendance-modal';
  attModal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">BIOMETRIC ATTENDANCE METRICS 📊</span>
        <button class="icon-btn" id="btn-close-modal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="modal-table-container">
          <table class="modal-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Present</th>
                <th>Total</th>
                <th>%</th>
                <th>75% Target Status</th>
              </tr>
            </thead>
            <tbody id="attendance-rows-container">
              <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">Scanning records...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(attModal);

  // DOM node references within Shadow DOM
  const consoleOutput = shadow.getElementById('console-output');
  const btnToggleBot = shadow.getElementById('btn-toggle-bot');
  const btnViewAttendance = shadow.getElementById('btn-view-attendance');
  const btnTriggerSync = shadow.getElementById('btn-trigger-sync');
  const subjectListContainer = shadow.getElementById('subject-list-container');
  const sniperListPanel = shadow.getElementById('sniper-list-panel');
  const sniperRows = shadow.getElementById('sniper-rows');
  const chkSniper = shadow.getElementById('chk-sniper');
  const progressRow = shadow.getElementById('bot-progress-row');
  const progressFill = shadow.getElementById('progress-fill');
  const progressText = shadow.getElementById('progress-text');
  const progressPct = shadow.getElementById('progress-pct');
  const btnCloseModal = shadow.getElementById('btn-close-modal');
  const attendanceRowsContainer = shadow.getElementById('attendance-rows-container');

  // State log utility
  function addLog(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `> ${text}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    
    // Persist logs to storage
    chrome.storage.local.get({ runLogs: [] }, (items) => {
      const logs = items.runLogs;
      logs.push({ text, type });
      if (logs.length > 50) logs.shift(); // keep it clean
      chrome.storage.local.set({ runLogs: logs });
    });
  }

  // Toggle Minimize/Maximize panel
  launcher.addEventListener('click', () => {
    panel.classList.remove('minimized');
    launcher.style.display = 'none';
  });

  shadow.getElementById('btn-minimize').addEventListener('click', () => {
    panel.classList.add('minimized');
    launcher.style.display = 'flex';
  });

  // Modal actions
  btnCloseModal.addEventListener('click', () => {
    attModal.classList.remove('active');
  });

  const btnCopyLogs = shadow.getElementById('btn-copy-logs');
  const btnClearLogs = shadow.getElementById('btn-clear-logs');
  if (btnCopyLogs) {
    btnCopyLogs.addEventListener('click', () => {
      const text = Array.from(consoleOutput.querySelectorAll('.log-line'))
                        .map(l => l.textContent)
                        .join('\n');
      navigator.clipboard.writeText(text);
      addLog('Logs copied to clipboard!', 'success');
    });
  }
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      consoleOutput.innerHTML = '';
      chrome.storage.local.set({ runLogs: [] });
      addLog('Console logs cleared.', 'system');
    });
  }

  // Vibe Selection listeners
  shadow.querySelectorAll('.vibe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll('.vibe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const vibe = btn.getAttribute('data-vibe');
      chrome.storage.local.set({ globalVibe: vibe });
      addLog(`Global vibe set to: ${vibe.toUpperCase()} Boy`, 'system');
    });
  });

  chkSniper.addEventListener('change', (e) => {
    if (e.target.checked) {
      sniperListPanel.classList.add('active');
      chrome.storage.local.set({ useSniperMode: true });
      addLog('Sniper Mode engaged. Select vibes individually.', 'system');
    } else {
      sniperListPanel.classList.remove('active');
      chrome.storage.local.set({ useSniperMode: false });
      addLog('Global Vibe restored.', 'system');
    }
  });

  // ── Storage State Load & Check ──
  chrome.storage.local.get({
    username: '',
    password: '',
    botMode: 'feedback',
    globalVibe: 'good',
    useSniperMode: false,
    sniperMap: {},
    botRunning: false,
    quietMode: false,
    runLogs: [],
    totalSuccess: 0,
    totalFailed: 0,
    currentSubject: '',
    skippedFeedbacks: [],
    skippedSubjects: [],
    totalPendingCount: 0,
    accounts: [],
    selectedAccount: 'new',
    customRemarks: ''
  }, async (store) => {
    // ── Panel Credentials Interface Logic ──
    const pSelAccount = shadow.getElementById('panel-sel-account');
    const pNewAccountInputs = shadow.getElementById('panel-new-account-inputs');
    const pTxtUsername = shadow.getElementById('panel-txt-username');
    const pTxtPassword = shadow.getElementById('panel-txt-password');
    const pBtnSaveAccount = shadow.getElementById('panel-btn-save-account');
    const pBtnDeleteAccount = shadow.getElementById('panel-btn-delete-account');

    function renderPanelAccountsDropdown() {
      if (!pSelAccount) return;
      pSelAccount.innerHTML = '';
      
      const accounts = store.accounts || [];
      const selected = store.selectedAccount || 'new';

      accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.username;
        opt.textContent = `👤 ${acc.username}`;
        if (acc.username === selected) opt.selected = true;
        pSelAccount.appendChild(opt);
      });

      const optNew = document.createElement('option');
      optNew.value = 'new';
      optNew.textContent = '➕ Add New Account...';
      if (selected === 'new') optNew.selected = true;
      pSelAccount.appendChild(optNew);

      // Toggle new account inputs and delete button visibility
      if (selected === 'new') {
        pNewAccountInputs.style.display = 'flex';
        if (pBtnDeleteAccount) pBtnDeleteAccount.style.display = 'none';
      } else {
        pNewAccountInputs.style.display = 'none';
        if (pBtnDeleteAccount) pBtnDeleteAccount.style.display = 'inline-flex';
      }
    }

    renderPanelAccountsDropdown();

    if (pSelAccount) {
      pSelAccount.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'new') {
          pNewAccountInputs.style.display = 'flex';
          if (pBtnDeleteAccount) pBtnDeleteAccount.style.display = 'none';
          chrome.storage.local.set({ selectedAccount: 'new' });
          store.selectedAccount = 'new';
        } else {
          pNewAccountInputs.style.display = 'none';
          if (pBtnDeleteAccount) pBtnDeleteAccount.style.display = 'inline-flex';
          const acc = (store.accounts || []).find(a => a.username === val);
          if (acc) {
            chrome.storage.local.set({
              selectedAccount: val,
              username: acc.username,
              password: acc.password
            });
            // Update active variables in store object
            store.selectedAccount = val;
            store.username = acc.username;
            store.password = acc.password;
            addLog(`Account selected: ${acc.username}`, 'system');
          }
        }
      });
    }

    if (pBtnDeleteAccount) {
      pBtnDeleteAccount.addEventListener('click', () => {
        const selected = store.selectedAccount || 'new';
        if (selected === 'new') return;
        
        if (confirm(`Are you sure you want to delete ${selected}?`)) {
          const accounts = store.accounts || [];
          const filtered = accounts.filter(a => a.username !== selected);
          
          chrome.storage.local.set({
            accounts: filtered,
            selectedAccount: 'new',
            username: '',
            password: ''
          }, () => {
            store.accounts = filtered;
            store.selectedAccount = 'new';
            store.username = '';
            store.password = '';
            renderPanelAccountsDropdown();
            addLog(`Purged saved account: ${selected}`, 'system');
          });
        }
      });
    }

    if (pBtnSaveAccount) {
      pBtnSaveAccount.addEventListener('click', () => {
        const u = pTxtUsername.value.trim();
        const p = pTxtPassword.value;
        if (!u || !p) {
          alert('🤠 Enter student ID and Password first, partner!');
          return;
        }

        const accounts = store.accounts || [];
        // Prevent duplicates
        const filtered = accounts.filter(a => a.username !== u);
        filtered.push({ username: u, password: p });

        chrome.storage.local.set({
          accounts: filtered,
          selectedAccount: u,
          username: u,
          password: p
        }, () => {
          store.accounts = filtered;
          store.selectedAccount = u;
          store.username = u;
          store.password = p;
          pTxtUsername.value = '';
          pTxtPassword.value = '';
          renderPanelAccountsDropdown();
          addLog(`Saved and loaded new account: ${u}`, 'success');
        });
      });
    }

    // Restore states
    shadow.querySelectorAll('.vibe-btn').forEach(b => {
      if (b.getAttribute('data-vibe') === store.globalVibe) b.classList.add('active');
      else b.classList.remove('active');
    });

    chkSniper.checked = store.useSniperMode;
    if (store.useSniperMode) sniperListPanel.classList.add('active');

    // Reload historical screen logs
    if (store.runLogs && store.runLogs.length > 0) {
      consoleOutput.innerHTML = '';
      store.runLogs.forEach(l => {
        const line = document.createElement('div');
        line.className = `log-line ${l.type}`;
        line.textContent = `> ${l.text}`;
        consoleOutput.appendChild(line);
      });
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    // Auto-maximize if the bot is currently running
    if (store.botRunning) {
      panel.classList.remove('minimized');
      launcher.style.display = 'none';
      btnToggleBot.innerHTML = '<span>🛑 STOP BOT</span>';
      btnToggleBot.style.backgroundColor = '#ef4444';
      btnToggleBot.style.color = '#fff';
      progressRow.classList.add('active');
    }

    // Apply Quiet Mode: hide host and launcher completely
    if (store.quietMode) {
      host.style.display = 'none';
      launcher.style.display = 'none';
    }

    // Hide UI blocks that don't belong to current mode
    if (!isDashboard) {
      const subSect = shadow.getElementById('subject-scanning-section');
      const setSect = shadow.getElementById('settings-section');
      if (subSect) subSect.style.display = 'none';
      if (setSect) setSect.style.display = 'none';
    }

    // Update live session status badge
    const sessionBadge = shadow.getElementById('session-badge');
    if (sessionBadge) {
      if (isLoginPage) {
        sessionBadge.textContent = 'LOGGED OUT';
        sessionBadge.style.backgroundColor = '#ef4444';
        sessionBadge.style.color = '#fff';
      } else {
        let pageName = 'LOGGED IN';
        if (isDashboard) pageName = 'LOGGED IN (DASHBOARD)';
        else if (isFeedbackForm) pageName = 'LOGGED IN (FEEDBACK)';
        else if (isAttendance) pageName = 'LOGGED IN (ATTENDANCE)';
        
        sessionBadge.textContent = pageName;
        sessionBadge.style.backgroundColor = '#4ade80';
        sessionBadge.style.color = '#09090b';
      }
    }

    // ── Execute automation steps depending on URL & ACTIVE MODE ──
    if (isLoginPage) {
      await handleLoginFlow(store);
    } else if (isDashboard) {
      if (store.botRunning && store.botMode !== 'feedback') {
        // Redirect to attendance if running calc or biometric mode
        addLog(`Navigating to Biometric Attendance portal...`, 'system');
        await sleep(1000);
        window.location.href = 'https://adamasknowledgecity.ac.in/student/attendance';
        return;
      }
      await handleDashboardFlow(store);
    } else if (isFeedbackForm) {
      await handleFeedbackFlow(store);
    } else if (isAttendance) {
      await handleAttendancePageFlow(store);
    }
  });

  // ── REACTIVE STORAGE SYNC ──
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    chrome.storage.local.get({
      accounts: [],
      selectedAccount: 'new',
      globalVibe: 'good',
      useSniperMode: false,
      quietMode: false,
      botRunning: false
    }, (newStore) => {
      // Sync panel active indicators
      const pSelAccount = shadow.getElementById('panel-sel-account');
      const pNewAccountInputs = shadow.getElementById('panel-new-account-inputs');
      if (pSelAccount) {
        pSelAccount.innerHTML = '';
        (newStore.accounts || []).forEach(acc => {
          const opt = document.createElement('option');
          opt.value = acc.username;
          opt.textContent = `👤 ${acc.username}`;
          if (acc.username === newStore.selectedAccount) opt.selected = true;
          pSelAccount.appendChild(opt);
        });
        const optNew = document.createElement('option');
        optNew.value = 'new';
        optNew.textContent = '➕ Add New Account...';
        if (newStore.selectedAccount === 'new') optNew.selected = true;
        pSelAccount.appendChild(optNew);

        if (newStore.selectedAccount === 'new') {
          pNewAccountInputs.style.display = 'flex';
        } else {
          pNewAccountInputs.style.display = 'none';
        }
      }

      // Sync vibe buttons
      shadow.querySelectorAll('.vibe-btn').forEach(b => {
        if (b.getAttribute('data-vibe') === newStore.globalVibe) b.classList.add('active');
        else b.classList.remove('active');
      });

      // Sync sniper mode checkbox
      const chkSniperElement = shadow.getElementById('chk-sniper');
      const sniperListPanelElement = shadow.getElementById('sniper-list-panel');
      if (chkSniperElement) {
        chkSniperElement.checked = newStore.useSniperMode;
        if (newStore.useSniperMode && sniperListPanelElement) sniperListPanelElement.classList.add('active');
        else if (sniperListPanelElement) sniperListPanelElement.classList.remove('active');
      }

      // Sync quiet mode
      if (newStore.quietMode) {
        host.style.display = 'none';
        launcher.style.display = 'none';
      } else {
        host.style.display = 'block';
        if (panel.classList.contains('minimized')) {
          launcher.style.display = 'flex';
        } else {
          launcher.style.display = 'none';
        }
      }
    });
  });

  // ── AUTO-LOGIN FLOW ──
  async function handleLoginFlow(store) {
    if (!store.botRunning) return;

    // Dynamically retrieve selected account from store list if credentials are not directly set
    let loginUser = store.username;
    let loginPass = store.password;

    if (store.selectedAccount && store.selectedAccount !== 'new') {
      const activeAcc = (store.accounts || []).find(a => a.username === store.selectedAccount);
      if (activeAcc) {
        loginUser = activeAcc.username;
        loginPass = activeAcc.password;
      }
    }

    if (!loginUser || !loginPass) {
      addLog('⚠️ No credentials active. Select an account or enter one in the panel, then click START.', 'system');
      chrome.storage.local.set({ botRunning: false });
      return;
    }

    addLog('Auto-login triggered. Waiting for form elements...', 'system');
    
    // Wait for BOTH credentials fields to be visible to ensure they are fully rendered
    const passInp = await waitForVisibleElement('input[type="password"]', 20, 500);
    const userInp = await waitForVisibleUsernameInput(20, 500);
    const submitBtn = await waitForVisibleSubmitButton(20, 500);

    if (userInp && passInp && submitBtn) {
      addLog('Form elements loaded. Populating credentials safely...', 'info');
      
      // Use the premium fill helper
      fillInputSafely(userInp, loginUser);
      fillInputSafely(passInp, loginPass);

      await sleep(1000);
      addLog('Credentials populated. Submitting...', 'success');
      submitBtn.click();
    } else {
      addLog('❌ Timeout: Could not locate visible credentials inputs or submit button in page DOM.', 'error');
      chrome.storage.local.set({ botRunning: false });
    }
  }

  // ── ATTENDANCE PAGE AUTORUN FLOWS ──
  async function handleAttendancePageFlow(store) {
    if (!store.botRunning) return;

    if (store.botMode === 'attendance') {
      addLog('Waiting for attendance records to load...', 'system');
      
      const tableFound = await waitForElement('table', 20, 500);
      if (!tableFound) {
        addLog('❌ Timeout: Could not locate biometric details table.', 'error');
        chrome.storage.local.set({ botRunning: false });
        return;
      }

      // Extract details and trigger popup modal
      attModal.classList.add('active');
      let table = Array.from(document.querySelectorAll('table')).find(t => 
        t.innerText.toLowerCase().includes('courses') && t.innerText.toLowerCase().includes('total present')
      );

      if (!table) {
        // Retry one more time after a short delay
        await sleep(1000);
        table = Array.from(document.querySelectorAll('table')).find(t => 
          t.innerText.toLowerCase().includes('courses') && t.innerText.toLowerCase().includes('total present')
        );
      }

      if (!table) {
        addLog('❌ Failed to locate Biometric details table on portal page.', 'error');
        chrome.storage.local.set({ botRunning: false });
        return;
      }

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      attendanceRowsContainer.innerHTML = '';
      let parsed = 0;

      rows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 5) {
          const course = tds[0].innerText.trim();
          const totalClasses = parseInt(tds[1].innerText.trim(), 10) || 0;
          const totalPresent = parseInt(tds[2].innerText.trim(), 10) || 0;
          const pct = parseFloat(tds[4].innerText.replace('%', '').trim()) || 0;

          // Target computation logic
          let targetMsg = '';
          let badgeClass = 'edge';

          if (pct < 75) {
            badgeClass = 'danger';
            let needed = Math.ceil((3 * totalClasses) - (4 * totalPresent));
            targetMsg = needed > 0 ? `⚠ Need ${needed} classes` : '⚠ On edge';
          } else {
            badgeClass = 'safe';
            let safeBunks = Math.floor(((4 * totalPresent) - (3 * totalClasses)) / 3);
            targetMsg = safeBunks > 0 ? `✓ Bunk ${safeBunks} classes` : `⚠ Danger edge`;
          }

          const modalRow = document.createElement('tr');
          modalRow.style.cursor = 'pointer';
          modalRow.className = 'course-row';
          modalRow.innerHTML = `
            <td><strong>${course.substring(0, 32)}</strong></td>
            <td>${totalPresent}</td>
            <td>${totalClasses}</td>
            <td><span class="pct-val">${pct}%</span></td>
            <td><span class="status-badge ${badgeClass}">${targetMsg}</span></td>
          `;

          // Simulator Sub-row
          const simRow = document.createElement('tr');
          simRow.className = 'simulator-row';
          simRow.style.display = 'none';
          simRow.innerHTML = `
            <td colspan="5" style="background-color: rgba(255,255,255,0.02); padding: 12px; border-bottom: 1px solid var(--bg-border);">
              <div class="sim-card" style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 800; font-size: 9px; color: var(--accent);">🤠 INTERACTIVE ATTENDANCE SIMULATOR</span>
                  <span class="sim-pct-badge" style="font-family: monospace; font-size: 11px; font-weight: 800; background-color: var(--bg-card-solid); border: 1px solid var(--bg-border); padding: 2px 6px; border-radius: 4px; color: var(--good);">${pct}%</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px;">
                  <!-- Attend Slide -->
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 8px; font-weight: 700; color: var(--text-muted);">ATTEND NEXT CLASSES</label>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <input type="range" class="range-attend" min="0" max="30" value="0" style="flex-grow: 1; accent-color: var(--good); margin: 0; padding: 0;">
                      <span class="lbl-attend" style="font-family: monospace; font-size: 10px; font-weight: 700; width: 20px; text-align: right;">0</span>
                    </div>
                  </div>
                  <!-- Bunk Slide -->
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 8px; font-weight: 700; color: var(--text-muted);">BUNK NEXT CLASSES</label>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <input type="range" class="range-bunk" min="0" max="30" value="0" style="flex-grow: 1; accent-color: var(--bad); margin: 0; padding: 0;">
                      <span class="lbl-bunk" style="font-family: monospace; font-size: 10px; font-weight: 700; width: 20px; text-align: right;">0</span>
                    </div>
                  </div>
                </div>
                
                <div class="sim-result-lbl" style="font-size: 9px; font-weight: 700; color: var(--text-muted); margin-top: 4px;">
                  Simulation: Attendance stays at <span class="sim-result-pct" style="color: var(--text-primary);">${pct}%</span>. Status: <span class="sim-result-status status-badge ${badgeClass}">${targetMsg}</span>
                </div>
              </div>
            </td>
          `;

          modalRow.addEventListener('click', () => {
            const isHidden = simRow.style.display === 'none';
            attendanceRowsContainer.querySelectorAll('.simulator-row').forEach(row => row.style.display = 'none');
            simRow.style.display = isHidden ? 'table-row' : 'none';
          });

          const rAttend = simRow.querySelector('.range-attend');
          const rBunk = simRow.querySelector('.range-bunk');
          const lAttend = simRow.querySelector('.lbl-attend');
          const lBunk = simRow.querySelector('.lbl-bunk');
          const simPctBadge = simRow.querySelector('.sim-pct-badge');
          const simResultPct = simRow.querySelector('.sim-result-pct');
          const simResultStatus = simRow.querySelector('.sim-result-status');

          function updateSimulation() {
            const attendVal = parseInt(rAttend.value, 10);
            const bunkVal = parseInt(rBunk.value, 10);
            
            lAttend.textContent = attendVal;
            lBunk.textContent = bunkVal;
            
            const simP = totalPresent + attendVal;
            const simT = totalClasses + attendVal + bunkVal;
            const simPct = simT > 0 ? Math.round((simP / simT) * 1000) / 10 : 0;
            
            simPctBadge.textContent = `${simPct}%`;
            simResultPct.textContent = `${simPct}%`;
            
            let simTargetMsg = '';
            let simBadgeClass = 'edge';
            
            if (simPct < 75) {
              simBadgeClass = 'danger';
              let needed = Math.ceil((3 * simT) - (4 * simP));
              simTargetMsg = needed > 0 ? `⚠ Need ${needed} classes` : '⚠ On edge';
              simPctBadge.style.color = 'var(--bad)';
            } else {
              simBadgeClass = 'safe';
              let safeBunks = Math.floor(((4 * simP) - (3 * simT)) / 3);
              simTargetMsg = safeBunks > 0 ? `✓ Bunk ${safeBunks} classes` : `⚠ Danger edge`;
              simPctBadge.style.color = 'var(--good)';
            }
            
            simResultStatus.textContent = simTargetMsg;
            simResultStatus.className = `sim-result-status status-badge ${simBadgeClass}`;
          }

          rAttend.addEventListener('input', updateSimulation);
          rBunk.addEventListener('input', updateSimulation);

          attendanceRowsContainer.appendChild(modalRow);
          attendanceRowsContainer.appendChild(simRow);
          parsed++;
        }
      });

      addLog(`📊 Extracted and analyzed ${parsed} course records.`, 'success');
      addLog('🏁 Target calculations complete. Stats displayed on modal!', 'success');
      addLog('🤠 tip: "You are clear to bunk, partner. Keep tabs on the limit!"', 'success');

      // Stop running state
      chrome.storage.local.set({ botRunning: false });
      btnToggleBot.innerHTML = '<span>🤠 START FEEDBACK BOT</span>';
      btnToggleBot.style.backgroundColor = 'var(--accent)';
      btnToggleBot.style.color = 'var(--bg-dark)';
      progressRow.classList.remove('active');

    } else if (store.botMode === 'sync') {
      addLog('⚡ Initiating bypass synchronization pings...', 'system');
      
      // Reset synchronization counters
      syncSuccessCount = 0;
      syncFailCount = 0;

      await sleep(1000);

      // Perform clicks
      const refreshButtons = document.querySelectorAll('button, a, input');
      let unlocked = 0;

      refreshButtons.forEach(btn => {
        const text = (btn.innerText || btn.title || btn.className || '').toLowerCase();
        if (text.includes('refresh') || text.includes('sync') || btn.querySelector('.fa-refresh, .fa-sync')) {
          btn.removeAttribute('disabled');
          btn.style.display = 'inline-block';
          btn.style.visibility = 'visible';
          btn.style.opacity = '1';
          btn.classList.remove('disabled');

          let parent = btn.parentElement;
          while(parent && parent.tagName !== 'BODY') {
            if (parent.style.display === 'none') parent.style.display = 'block';
            parent = parent.parentElement;
          }
          unlocked++;
        }
      });

      if (unlocked === 0) {
        addLog('❌ Failed to locate Sync triggers on the portal.', 'error');
        chrome.storage.local.set({ botRunning: false });
        return;
      }

      addLog(`🔓 Enabled ${unlocked} sync locks. Firing requests...`, 'info');
      refreshButtons.forEach(btn => {
        const text = (btn.innerText || btn.title || btn.className || '').toLowerCase();
        if (text.includes('refresh') || text.includes('sync') || btn.querySelector('.fa-refresh, .fa-sync')) {
          try { btn.click(); } catch(e){}
        }
      });

      addLog('⌛ Dispatched click triggers. Awaiting server responses from Adamas backend...', 'info');
      await sleep(7000); // Mirror terminal's 7 seconds sleep exactly

      addLog(`Network Intersect Result: ${syncSuccessCount} Successful Syncs | ${syncFailCount} Failed (Server Errors)`, syncFailCount > 0 ? 'error' : 'success');
      
      if (syncFailCount > 0) {
        addLog('❌ Warning: Detected server sync errors. Some sessions might not have registered.', 'error');
      } else if (syncSuccessCount > 0) {
        addLog('🎉 All biometric sync updates successfully verified!', 'success');
      } else {
        addLog('⚠️ Sync execution completed but no network callbacks were caught.', 'system');
      }

      addLog('⚡ Attendance records bypass synchronization complete!', 'success');
      addLog('🤠: "Fired sync bullets. Checked and loaded, partner!"', 'success');

      // Stop running state
      chrome.storage.local.set({ botRunning: false });
      btnToggleBot.innerHTML = '<span>🤠 START FEEDBACK BOT</span>';
      btnToggleBot.style.backgroundColor = 'var(--accent)';
      btnToggleBot.style.color = 'var(--bg-dark)';
      progressRow.classList.remove('active');
    }
  }

  // ── FLOW 1: DASHBOARD PAGE ──
  async function handleDashboardFlow(store) {
    addLog('Scanning dashboard for subject cards...', 'info');
    
    // 1. Scan the cards (Wait for cards to load)
    const cards = await waitForElements('.subject-item-modern', 1, 20, 500);
    if (cards.length === 0) {
      subjectListContainer.innerHTML = '❌ Could not find subject cards on dashboard. Try refreshing.';
      addLog('❌ Timeout: No subject cards found on dashboard.', 'error');
      if (store.botRunning) {
        chrome.storage.local.set({ botRunning: false });
      }
      return;
    }

    // Parse subjects
    const subjects = [];
    let totalPending = 0;

    cards.forEach(card => {
      const nameEl = card.querySelector('.subject-name, h6, h5, strong');
      const name = nameEl ? nameEl.innerText.trim() : 'Unknown';
      const text = card.innerText || '';
      const m = text.match(/(\d+)\/(\d+)\s*completed/i);
      if (m) {
        const done = parseInt(m[1]), total = parseInt(m[2]);
        const pending = total - done;
        subjects.push({ name, done, total, pending, el: card });
        if (pending > 0) totalPending += pending;
      }
    });

    // Render parsed list
    subjectListContainer.innerHTML = '';
    sniperRows.innerHTML = '';

    subjects.forEach(s => {
      // Small progress block
      const row = document.createElement('div');
      row.style.margin = '4px 0';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `
        <span>${s.name.substring(0, 30)}</span>
        <span style="color: ${s.pending > 0 ? 'var(--neutral)' : 'var(--good)'}; font-weight: bold;">
          ${s.done}/${s.total} ${s.pending > 0 ? `(${s.pending} left)` : '✓'}
        </span>
      `;
      subjectListContainer.appendChild(row);

      // Sniper rows
      if (s.pending > 0) {
        const sniperRow = document.createElement('div');
        sniperRow.className = 'sniper-item';
        const savedVibe = store.sniperMap[s.name] || 'good';
        sniperRow.innerHTML = `
          <span class="sniper-name" title="${s.name}">${s.name}</span>
          <select class="sniper-select" data-subject="${s.name}">
            <option value="good" ${savedVibe === 'good' ? 'selected' : ''}>😇 GOOD</option>
            <option value="neutral" ${savedVibe === 'neutral' ? 'selected' : ''}>😐 MEH</option>
            <option value="bad" ${savedVibe === 'bad' ? 'selected' : ''}>👿 BAD</option>
          </select>
        `;
        sniperRows.appendChild(sniperRow);
      }
    });

    // Bind Sniper Select events to store mapped vibes
    shadow.querySelectorAll('.sniper-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const subName = e.target.getAttribute('data-subject');
        const v = e.target.value;
        chrome.storage.local.get({ sniperMap: {} }, (items) => {
          const map = items.sniperMap;
          map[subName] = v;
          chrome.storage.local.set({ sniperMap: map });
          addLog(`Sniper vibe for "${subName}" set to ${v.toUpperCase()}`, 'system');
        });
      });
    });

    // 2. If the bot is active and running, continue the loop
    if (store.botRunning && store.botMode === 'feedback') {
      // Calculate current progress
      const initialPending = store.totalPendingCount || (totalPending + store.totalSuccess);
      const doneSoFar = store.totalSuccess;
      const progress = initialPending > 0 ? (doneSoFar / initialPending) * 100 : 100;
      
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `Completed ${doneSoFar} of ${initialPending}`;
      progressPct.textContent = `${Math.round(progress)}%`;

      // Find the first subject with pending items that has not been permanently skipped
      const target = subjects.find(s => s.pending > 0 && !store.skippedSubjects.includes(s.name));

      if (!target) {
        // Finished!
        addLog('🏁 ALL DONE! Auto-submitted every pending feedback form.', 'success');
        addLog('🤠 tips hat: "You submitted all of \'em, partner. Even Arthur Morgan would tip his hat."', 'success');

        // Update overall statistics
        chrome.storage.local.get({ totalSubmitted: 0, totalRuns: 0 }, (statsObj) => {
          chrome.storage.local.set({
            totalSubmitted: statsObj.totalSubmitted + store.totalSuccess,
            totalRuns: statsObj.totalRuns + 1,
            botRunning: false,
            runLogs: [] // clear
          });
        });

        // Reset UI
        btnToggleBot.innerHTML = '<span>🤠 START FEEDBACK BOT</span>';
        btnToggleBot.style.backgroundColor = 'var(--accent)';
        btnToggleBot.style.color = 'var(--bg-dark)';
        progressRow.classList.remove('active');
        return;
      }

      addLog(`📚 Scanning subject modal: "${target.name}"...`, 'info');
      await sleep(1500);

      // Scroll subject card and click it to open the modal
      target.el.scrollIntoView({ block: 'center' });
      target.el.click();
      await sleep(2000); // let modal animate open

      // Scan modal for Feedback buttons
      const candidates = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
      const buttons = candidates.filter(btn => {
        const href = (btn.getAttribute('href') || '').toLowerCase();
        const text = (btn.innerText || btn.textContent || '').toLowerCase();
        const className = (btn.className || '').toLowerCase();
        
        return href.includes('give-feedback') || 
               text.includes('give feedback') || 
               className.includes('give-feedback');
      });
      
      // Locate the first button we haven't skipped/failed on
      let targetBtn = null;
      for (const btn of buttons) {
        const href = btn.getAttribute('href');
        const identifier = href || btn.innerText || btn.textContent;
        if (!store.skippedFeedbacks.includes(identifier)) {
          targetBtn = btn;
          break;
        }
      }

      if (!targetBtn) {
        // If we found no active button but we know there are pending feedbacks, we must navigate back
        addLog(`⚠️ Modal scanned, but found no new clickable feedbacks. Moving to next subject.`, 'system');
        
        const skipped = store.skippedSubjects;
        skipped.push(target.name);
        chrome.storage.local.set({ skippedSubjects: skipped });

        window.location.reload();
        return;
      }

      // Record this subject name & trigger action
      chrome.storage.local.set({ currentSubject: target.name });
      
      const dateText = (targetBtn.parentElement.innerText || '').match(/\d{2}-\d{2}-\d{4}/);
      const logDate = dateText ? `for class date ${dateText[0]}` : '';
      
      addLog(`📝 [Bot] Opening form for ${target.name} ${logDate}...`, 'system');
      await sleep(1000);

      // Open the page
      const targetHref = targetBtn.getAttribute('href');
      if (targetHref) {
        window.location.href = targetHref.startsWith('http') ? targetHref : `https://adamasknowledgecity.ac.in${targetHref}`;
      } else {
        targetBtn.click();
      }
    }
  }

  // ── FLOW 2: FEEDBACK FILL PAGE ──
  async function handleFeedbackFlow(store) {
    if (!store.botRunning) return;

    addLog(`📝 Loading feedback form for "${store.currentSubject}"...`, 'info');
    
    // Wait for the form elements to load
    const elementsIndicator = await waitForElement('input[type="radio"], textarea', 20, 500);
    if (!elementsIndicator) {
      addLog('❌ Timeout: Feedback form elements did not load.', 'error');
      await sleep(1500);
      window.location.href = 'https://adamasknowledgecity.ac.in/student/dashboard';
      return;
    }

    addLog(`📝 Filling form for "${store.currentSubject}"...`, 'info');
    await sleep(400);

    try {
      // Determine what vibe this subject needs
      let currentVibe = store.globalVibe;
      if (store.useSniperMode && store.sniperMap[store.currentSubject]) {
        currentVibe = store.sniperMap[store.currentSubject];
      }

      // ── 1. Select Radios Safely ──
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const groups = {};
      allRadios.forEach(r => {
        if (!groups[r.name]) groups[r.name] = [];
        groups[r.name].push(r);
      });

      let clickedRadiosCount = 0;
      for (const name in groups) {
        const group = groups[name];
        if (group.length === 0) continue;
        
        let targetIndex = 0;
        if (group.length === 2) {
          // Yes/No radio group
          const yesIndex = group.findIndex(r => {
            const val = (r.value || '').toLowerCase();
            let labelText = '';
            if (r.id) {
              const label = document.querySelector(`label[for="${r.id}"]`);
              if (label) labelText = label.innerText.toLowerCase();
            }
            return val === 'y' || val.includes('yes') || val.includes('agree') || labelText.includes('yes') || labelText.includes('agree');
          });
          
          if (currentVibe === 'good') {
            targetIndex = yesIndex >= 0 ? yesIndex : 0;
          } else if (currentVibe === 'neutral') {
            targetIndex = 0;
          } else if (currentVibe === 'bad') {
            targetIndex = yesIndex >= 0 ? (yesIndex === 0 ? 1 : 0) : 1;
          }
        } else {
          // Likert scale (e.g. 5 options or 3 options)
          const firstVal = (group[0].value || '').toLowerCase();
          let firstLabel = '';
          if (group[0].id) {
            const label = document.querySelector(`label[for="${group[0].id}"]`);
            if (label) firstLabel = label.innerText.toLowerCase();
          }
          
          const isWorstFirst = firstVal.includes('poor') || 
                               firstVal.includes('disagree') || 
                               firstVal.includes('bad') || 
                               firstVal.includes('unsatisfactory') || 
                               firstVal.includes('1') || 
                               firstVal === 'n' ||
                               firstLabel.includes('poor') || 
                               firstLabel.includes('disagree') || 
                               firstLabel.includes('bad') || 
                               firstLabel.includes('strongly disagree');
                               
          const isBestFirst = firstVal.includes('excellent') || 
                              firstVal.includes('agree') || 
                              firstVal.includes('good') || 
                              firstVal.includes('satisfactory') || 
                              firstVal.includes('5') || 
                              firstVal === 'y' ||
                              firstLabel.includes('excellent') || 
                              firstLabel.includes('agree') || 
                              firstLabel.includes('good') || 
                              firstLabel.includes('strongly agree');
                              
          let isDescending = isBestFirst && !isWorstFirst; // best option is listed first
          
          if (currentVibe === 'good') {
            targetIndex = isDescending ? 0 : group.length - 1;
          } else if (currentVibe === 'neutral') {
            targetIndex = Math.floor(group.length / 2);
          } else if (currentVibe === 'bad') {
            targetIndex = isDescending ? group.length - 1 : 0;
          }
        }

        const target = group[targetIndex];
        if (target) {
          target.scrollIntoView({ block: 'center' });
          
          try {
            target.checked = true;
            target.dispatchEvent(new Event('change', { bubbles: true }));
            target.dispatchEvent(new Event('click', { bubbles: true }));
          } catch (e) {
            target.click();
          }
          clickedRadiosCount++;
        }
      }
      if (clickedRadiosCount > 0) {
        addLog(`☑️ Clicked ${clickedRadiosCount} vibe-radios`, 'success');
      }
      await sleep(400);

      // ── 1b. Handle Select Dropdowns (for departments using select controls) ──
      let clickedSelectsCount = 0;
      const selectElements = Array.from(document.querySelectorAll('select'));
      selectElements.forEach(select => {
        const options = Array.from(select.options);
        const validOptions = options.filter(opt => {
          const val = opt.value || '';
          const txt = (opt.innerText || '').toLowerCase();
          return val !== '' && !txt.includes('select') && !txt.includes('choose');
        });
        
        if (validOptions.length === 0) return;
        
        let targetOption = null;
        if (validOptions.length === 2) {
          const yesIndex = validOptions.findIndex(opt => {
            const txt = (opt.innerText || opt.value || '').toLowerCase();
            return txt.includes('yes') || txt.includes('agree') || txt.includes('y') || txt.includes('good');
          });
          if (currentVibe === 'good') {
            targetOption = yesIndex >= 0 ? validOptions[yesIndex] : validOptions[0];
          } else if (currentVibe === 'neutral') {
            targetOption = validOptions[0];
          } else if (currentVibe === 'bad') {
            const noIndex = yesIndex >= 0 ? (yesIndex === 0 ? 1 : 0) : 1;
            targetOption = validOptions[noIndex];
          }
        } else {
          const firstTxt = (validOptions[0].innerText || validOptions[0].value || '').toLowerCase();
          const isWorstFirst = firstTxt.includes('poor') || 
                               firstTxt.includes('disagree') || 
                               firstTxt.includes('bad') || 
                               firstTxt.includes('unsatisfactory') || 
                               firstTxt.includes('1') || 
                               firstTxt.includes('no');
                               
          const isBestFirst = firstTxt.includes('excellent') || 
                              firstTxt.includes('agree') || 
                              firstTxt.includes('good') || 
                              firstTxt.includes('satisfactory') || 
                              firstTxt.includes('5') || 
                              firstTxt.includes('yes');
          
          let isDescending = isBestFirst && !isWorstFirst;
          
          let targetIndex = 0;
          if (currentVibe === 'good') {
            targetIndex = isDescending ? 0 : validOptions.length - 1;
          } else if (currentVibe === 'neutral') {
            targetIndex = Math.floor(validOptions.length / 2);
          } else if (currentVibe === 'bad') {
            targetIndex = isDescending ? validOptions.length - 1 : 0;
          }
          targetOption = validOptions[targetIndex];
        }
        
        if (targetOption) {
          select.value = targetOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          clickedSelectsCount++;
        }
      });
      if (clickedSelectsCount > 0) {
        addLog(`☑️ Selected ${clickedSelectsCount} vibe-dropdowns`, 'success');
      }
      await sleep(400);

      // ── 2. Adjust Sliders Safely ──
      const sliders = document.querySelectorAll('input[type="range"]');
      sliders.forEach(s => {
        let max = parseInt(s.max) || 5;
        let min = parseInt(s.min) || 1;
        let val = max;
        if (currentVibe === 'neutral') val = Math.floor((max + min) / 2);
        if (currentVibe === 'bad') val = min;
        
        try {
          const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          valueSetter.call(s, val);
        } catch (e) {
          s.value = val;
        }
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (sliders.length > 0) addLog(`🎚️ Set ${sliders.length} sliders to target value`, 'success');
      await sleep(400);

      // ── 3. Fill Required/Visible Comments Safely ──
      const commentsMap = {
        good: [
          "The lectures were extremely helpful, well-structured, and clear.",
          "Great interaction and methodology. Highly recommended course.",
          "Excellent support and informative study materials.",
          "Engaging sessions with perfect pacing and clear explanations.",
          "Outstanding instruction with great examples and practical learning."
        ],
        neutral: [
          "Satisfactory teaching. The course coverage was fine.",
          "Average presentation style. Standard lectures.",
          "Course delivery is okay and pacing is reasonable.",
          "No specific suggestions. The topics were covered properly.",
          "Standard instruction quality. Interaction was decent."
        ],
        bad: [
          "Needs better time management and pacing of topics.",
          "Very dry explanation. Mostly reading from ppt slides.",
          "Difficult to follow the lectures. Concepts need more detail.",
          "Lack of student engagement and interaction in classes.",
          "Material could be better explained and organized."
        ]
      };
      const comments = commentsMap[currentVibe] || commentsMap.good;
      const finalComment = currentVibe === 'custom' ? (store.customRemarks || '') : comments[Math.floor(Math.random() * comments.length)];
      
      let filledComment = false;
      document.querySelectorAll('textarea, input[type="text"]').forEach(el => {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
        
        if (isVisible && (el.tagName.toLowerCase() === 'textarea' || el.required || el.getAttribute('required') !== null || el.classList.contains('required'))) {
          // Skip general non-required short inputs (honeypot protection)
          if (el.tagName.toLowerCase() === 'input' && el.type === 'text' && !el.required) return;
          
          fillInputSafely(el, finalComment);
          filledComment = true;
        }
      });
      if (filledComment) addLog(`✍️ Filled mandatory remarks`, 'success');
      await sleep(400);

      // ── 4. Submit ──
      const submitSel = 'button[type="submit"], button.btn-primary, input[type="submit"]';
      const btn = document.querySelector(submitSel);
      if (!btn) throw new Error('Could not find submit button');

      btn.scrollIntoView({ block: 'center' });
      await sleep(500);
      
      // Update success counters
      chrome.storage.local.set({
        totalSuccess: store.totalSuccess + 1
      });

      addLog('🚀 Submitting form...', 'system');
      btn.click();

      // Wait for server rate limit & redirect
      await sleep(DELAY_AFTER_SUBMIT_MS);
      window.location.href = 'https://adamasknowledgecity.ac.in/student/dashboard';

    } catch (err) {
      addLog(`❌ Failed to submit: ${err.message}`, 'error');
      
      // Save failure context
      const currentUrl = window.location.href;
      const fails = store.skippedFeedbacks;
      fails.push(currentUrl);

      chrome.storage.local.set({
        totalFailed: store.totalFailed + 1,
        skippedFeedbacks: fails
      });

      await sleep(DELAY_AFTER_ERROR_MS);
      window.location.href = 'https://adamasknowledgecity.ac.in/student/dashboard';
    }
  }

  // ── Bot start/stop control toggler ──
  btnToggleBot.addEventListener('click', () => {
    chrome.storage.local.get({ botRunning: false, botMode: 'feedback' }, (items) => {
      if (items.botRunning) {
        // STOP BOT
        chrome.storage.local.set({ botRunning: false });
        btnToggleBot.innerHTML = '<span>🤠 START FEEDBACK BOT</span>';
        btnToggleBot.style.backgroundColor = 'var(--accent)';
        btnToggleBot.style.color = 'var(--bg-dark)';
        progressRow.classList.remove('active');
        addLog('🛑 Bot execution halted by user.', 'system');
      } else {
        // START BOT
        addLog(`🔥 Engaging ${items.botMode.toUpperCase()} mode...`, 'system');
        
        let initialPending = 0;
        if (isDashboard && items.botMode === 'feedback') {
          document.querySelectorAll('.subject-item-modern').forEach(card => {
            const m = (card.innerText || '').match(/(\d+)\/(\d+)\s*completed/i);
            if (m) initialPending += (parseInt(m[2]) - parseInt(m[1]));
          });
        }

        chrome.storage.local.set({
          botRunning: true,
          totalSuccess: 0,
          totalFailed: 0,
          skippedFeedbacks: [],
          skippedSubjects: [],
          totalPendingCount: initialPending
        }, () => {
          btnToggleBot.innerHTML = '<span>🛑 STOP BOT</span>';
          btnToggleBot.style.backgroundColor = '#ef4444';
          btnToggleBot.style.color = '#fff';
          progressRow.classList.add('active');
          
          // Trigger scan loop reload
          if (isLoginPage) {
            window.location.reload();
          } else if (isDashboard) {
            if (items.botMode === 'feedback') {
              window.location.reload();
            } else {
              window.location.href = 'https://adamasknowledgecity.ac.in/student/attendance';
            }
          } else if (isAttendance) {
            window.location.reload();
          } else {
            window.location.href = 'https://adamasknowledgecity.ac.in/student/dashboard';
          }
        });
      }
    });
  });

  // ── MANUAL BUTTON TRIGGERS ──
  btnViewAttendance.addEventListener('click', async () => {
    if (!isAttendance) {
      addLog('Navigating to Attendance portal...', 'system');
      await sleep(1000);
      window.location.href = 'https://adamasknowledgecity.ac.in/student/attendance';
      return;
    }
    // Set temp modes and execute logic synchronously
    chrome.storage.local.set({ botRunning: true, botMode: 'attendance' }, () => {
      window.location.reload();
    });
  });

  btnTriggerSync.addEventListener('click', async () => {
    if (!isAttendance) {
      addLog('Navigating to Attendance portal...', 'system');
      await sleep(1000);
      window.location.href = 'https://adamasknowledgecity.ac.in/student/attendance';
      return;
    }
    // Set temp modes and execute logic synchronously
    chrome.storage.local.set({ botRunning: true, botMode: 'sync' }, () => {
      window.location.reload();
    });
  });

})();
