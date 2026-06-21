document.addEventListener('DOMContentLoaded', () => {
  // DOM element references
  const selAccount = document.getElementById('sel-account');
  const btnDeleteAccount = document.getElementById('btn-delete-account');
  const newAccountFields = document.getElementById('new-account-fields');
  
  const txtUsername = document.getElementById('txt-username');
  const txtPassword = document.getElementById('txt-password');
  const btnSaveAccount = document.getElementById('btn-save-account');
  
  const chkRemember = document.getElementById('chk-remember');
  const chkQuietMode = document.getElementById('chk-quiet-mode');
  
  const modeBtns = document.querySelectorAll('.mode-btn');
  const vibeConfigPanel = document.getElementById('vibe-config-panel');
  const vibeBtns = document.querySelectorAll('.vibe-btn');
  const chkSniperPopup = document.getElementById('chk-sniper-popup');
  
  const btnLaunchBot = document.getElementById('btn-launch-bot');
  const btnStopBot = document.getElementById('btn-stop-bot');
  
  const statSubmitted = document.getElementById('stat-submitted');
  const statRuns = document.getElementById('stat-runs');
  const statTimeSaved = document.getElementById('stat-time-saved');

  let activeMode = 'feedback';
  let activeVibe = 'good';
  let savedAccounts = [];
  let currentSelectedAccount = 'new';

  // 1. Load initial states from chrome storage
  chrome.storage.local.get({
    username: '',
    password: '',
    remember: true,
    quietMode: false,
    accounts: [],
    selectedAccount: 'new',
    botMode: 'feedback',
    globalVibe: 'good',
    useSniperMode: false,
    botRunning: false,
    totalSubmitted: 0,
    totalRuns: 0,
    customRemarks: ''
  }, (items) => {
    // Update Live Portal Status badge
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const tabUrl = activeTab && activeTab.url ? activeTab.url : '';
      const statusLbl = document.getElementById('lbl-status');
      
      if (!statusLbl) return;

      if (!tabUrl.toLowerCase().includes('adamasknowledgecity.ac.in/student')) {
        statusLbl.textContent = 'PORTAL INACTIVE';
        statusLbl.style.backgroundColor = 'var(--bg-card)';
        statusLbl.style.color = 'var(--text-muted)';
      } else {
        const isLogin = tabUrl.includes('/student/login') || tabUrl.endsWith('/student/') || tabUrl.endsWith('/student') || (!tabUrl.includes('/dashboard') && !tabUrl.includes('/feedback') && !tabUrl.includes('/attendance'));
        if (isLogin) {
          statusLbl.textContent = '🔴 LOGGED OUT';
          statusLbl.style.backgroundColor = '#ef4444';
          statusLbl.style.color = '#fff';
        } else {
          statusLbl.textContent = '🟢 LOGGED IN';
          statusLbl.style.backgroundColor = '#4ade80';
          statusLbl.style.color = '#09090b';
        }
      }
    });

    // Populate stats
    statSubmitted.textContent = items.totalSubmitted;
    statRuns.textContent = items.totalRuns;
    
    const minutes = items.totalSubmitted * 3;
    const hrs = Math.floor(minutes / 60);
    const mns = minutes % 60;
    statTimeSaved.textContent = hrs > 0 ? `${hrs}h ${mns}m` : `${mns} mins`;

    // Populate checkboxes
    chkRemember.checked = items.remember;
    chkQuietMode.checked = items.quietMode;

    // Load and populate accounts list
    savedAccounts = items.accounts || [];
    currentSelectedAccount = items.selectedAccount || 'new';
    
    renderAccountsDropdown();

    // Populate modes
    activeMode = items.botMode;
    modeBtns.forEach(btn => {
      if (btn.getAttribute('data-mode') === activeMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    toggleVibePanel(activeMode);

    // Populate vibes
    activeVibe = items.globalVibe;
    vibeBtns.forEach(btn => {
      if (btn.getAttribute('data-vibe') === activeVibe) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const customRemarksGroup = document.getElementById('custom-remarks-group');
    const txtCustomRemarks = document.getElementById('txt-custom-remarks');
    if (txtCustomRemarks) {
      txtCustomRemarks.value = items.customRemarks || '';
    }
    if (customRemarksGroup) {
      customRemarksGroup.style.display = activeVibe === 'custom' ? 'block' : 'none';
    }

    chkSniperPopup.checked = items.useSniperMode;

    // Populate bot running state
    if (items.botRunning) {
      setRunningUI(true);
    }
  });

  // Render accounts select dropdown
  function renderAccountsDropdown() {
    // Keep first option
    selAccount.innerHTML = '<option value="new">+ Add New Account...</option>';
    
    savedAccounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.username;
      opt.textContent = acc.username;
      selAccount.appendChild(opt);
    });

    selAccount.value = currentSelectedAccount;
    handleAccountSelectionChange();
  }

  // Handle selection state changes
  function handleAccountSelectionChange() {
    const val = selAccount.value;
    currentSelectedAccount = val;

    if (val === 'new') {
      newAccountFields.style.display = 'block';
      btnDeleteAccount.style.display = 'none';
      txtUsername.value = '';
      txtPassword.value = '';
      chrome.storage.local.set({ selectedAccount: val });
    } else {
      newAccountFields.style.display = 'none';
      btnDeleteAccount.style.display = 'block';
      
      const acc = savedAccounts.find(a => a.username === val);
      if (acc) {
        txtUsername.value = acc.username;
        txtPassword.value = acc.password;
        chrome.storage.local.set({
          selectedAccount: val,
          username: acc.username,
          password: acc.password
        });
      }
    }
  }

  // Account dropdown change listener
  selAccount.addEventListener('change', handleAccountSelectionChange);

  // Save new account trigger
  btnSaveAccount.addEventListener('click', () => {
    const user = txtUsername.value.trim();
    const pass = txtPassword.value;

    if (!user || !pass) {
      alert('🤠 Enter Student ID and Password to save, partner.');
      return;
    }

    // Add or update account list
    const existingIndex = savedAccounts.findIndex(a => a.username === user);
    if (existingIndex >= 0) {
      savedAccounts[existingIndex].password = pass;
    } else {
      savedAccounts.push({ username: user, password: pass });
    }

    chrome.storage.local.set({
      accounts: savedAccounts,
      selectedAccount: user,
      username: user,
      password: pass
    }, () => {
      currentSelectedAccount = user;
      renderAccountsDropdown();
      alert('💾 Account saved successfully!');
    });
  });

  // Delete saved account trigger
  btnDeleteAccount.addEventListener('click', () => {
    const val = selAccount.value;
    if (val === 'new') return;

    if (!confirm(`🤠 Remove saved account "${val}"?`)) return;

    savedAccounts = savedAccounts.filter(a => a.username !== val);
    chrome.storage.local.set({ accounts: savedAccounts, selectedAccount: 'new' }, () => {
      currentSelectedAccount = 'new';
      renderAccountsDropdown();
    });
  });

  // 2. Click handler on modes
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMode = btn.getAttribute('data-mode');
      chrome.storage.local.set({ botMode: activeMode });
      toggleVibePanel(activeMode);
    });
  });

  function toggleVibePanel(mode) {
    if (mode === 'feedback') {
      vibeConfigPanel.style.display = 'block';
    } else {
      vibeConfigPanel.style.display = 'none';
    }
  }

  // 3. Click handler on vibes
  vibeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      vibeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeVibe = btn.getAttribute('data-vibe');
      chrome.storage.local.set({ globalVibe: activeVibe });
      
      const customRemarksGroup = document.getElementById('custom-remarks-group');
      if (customRemarksGroup) {
        customRemarksGroup.style.display = activeVibe === 'custom' ? 'block' : 'none';
      }
    });
  });

  const txtCustomRemarks = document.getElementById('txt-custom-remarks');
  if (txtCustomRemarks) {
    txtCustomRemarks.addEventListener('input', (e) => {
      chrome.storage.local.set({ customRemarks: e.target.value });
    });
  }

  // 4. Checkbox handlers
  chkSniperPopup.addEventListener('change', (e) => {
    chrome.storage.local.set({ useSniperMode: e.target.checked });
  });

  chkRemember.addEventListener('change', (e) => {
    chrome.storage.local.set({ remember: e.target.checked });
  });

  chkQuietMode.addEventListener('change', (e) => {
    chrome.storage.local.set({ quietMode: e.target.checked });
  });

  // 5. Helper function for UI states
  function setRunningUI(isRunning) {
    if (isRunning) {
      btnLaunchBot.style.display = 'none';
      btnStopBot.style.display = 'block';
      selAccount.disabled = true;
      btnDeleteAccount.disabled = true;
      txtUsername.disabled = true;
      txtPassword.disabled = true;
      btnSaveAccount.disabled = true;
      chkRemember.disabled = true;
      chkQuietMode.disabled = true;
      modeBtns.forEach(b => b.style.pointerEvents = 'none');
      vibeBtns.forEach(b => b.style.pointerEvents = 'none');
      chkSniperPopup.disabled = true;
    } else {
      btnLaunchBot.style.display = 'block';
      btnStopBot.style.display = 'none';
      selAccount.disabled = false;
      btnDeleteAccount.disabled = false;
      txtUsername.disabled = false;
      txtPassword.disabled = false;
      btnSaveAccount.disabled = false;
      chkRemember.disabled = false;
      chkQuietMode.disabled = false;
      modeBtns.forEach(b => b.style.pointerEvents = 'auto');
      vibeBtns.forEach(b => b.style.pointerEvents = 'auto');
      chkSniperPopup.disabled = false;
    }
  }

  // 6. Launch button trigger
  btnLaunchBot.addEventListener('click', () => {
    let user = '';
    let pass = '';

    if (currentSelectedAccount === 'new') {
      user = txtUsername.value.trim();
      pass = txtPassword.value;
    } else {
      const acc = savedAccounts.find(a => a.username === currentSelectedAccount);
      if (acc) {
        user = acc.username;
        pass = acc.password;
      }
    }

    if (!user || !pass) {
      alert('🤠 Whoa there! Enter or select Student credentials first, partner.');
      return;
    }

    const customText = txtCustomRemarks ? txtCustomRemarks.value.trim() : '';

    // Save active configurations for launch
    const storeObj = {
      username: user,
      password: pass,
      botRunning: true,
      totalSuccess: 0,
      totalFailed: 0,
      skippedFeedbacks: [],
      skippedSubjects: [],
      totalPendingCount: 0,
      customRemarks: customText,
      runLogs: [
        { text: `🔥 Initiating ${activeMode.toUpperCase()} run for ID: ${user}...`, type: 'system' }
      ]
    };

    chrome.storage.local.set(storeObj, () => {
      setRunningUI(true);

      // Perform redirection or reload target page
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        const tabUrl = activeTab && activeTab.url ? activeTab.url : '';

        if (tabUrl.toLowerCase().includes('adamasknowledgecity.ac.in/student')) {
          // Already on portal, reload it to kick off content script
          chrome.tabs.reload(activeTab.id, {}, () => {
            window.close();
          });
        } else {
          // Open student portal and let content script handle the rest
          chrome.tabs.create({ url: 'https://adamasknowledgecity.ac.in/student/login' }, () => {
            window.close();
          });
        }
      });
    });
  });

  // 7. Stop button trigger
  btnStopBot.addEventListener('click', () => {
    chrome.storage.local.set({ botRunning: false }, () => {
      setRunningUI(false);
      chrome.storage.local.get({ runLogs: [] }, (items) => {
        const logs = items.runLogs;
        logs.push({ text: '🛑 Active execution stopped by user.', type: 'system' });
        chrome.storage.local.set({ runLogs: logs });
      });
    });
  });

  // 8. Reactive listener for real-time sync with in-page overlay
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    
    let needsRender = false;
    
    if (changes.accounts) {
      savedAccounts = changes.accounts.newValue || [];
      needsRender = true;
    }
    if (changes.selectedAccount) {
      currentSelectedAccount = changes.selectedAccount.newValue || 'new';
      needsRender = true;
    }
    if (changes.botRunning) {
      setRunningUI(changes.botRunning.newValue);
    }
    
    if (needsRender) {
      renderAccountsDropdown();
    }
  });
});
