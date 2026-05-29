// Background Worker for MV3 Chrome Extension
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Initialize default local storage values
    chrome.storage.local.set({
      totalSubmitted: 0,
      totalRuns: 0,
      vibes: { good: 0, neutral: 0, bad: 0 },
      globalVibe: 'good',
      useSniperMode: false,
      sniperMap: {},
      botRunning: false,
      runLogs: [
        { text: 'Howdy, partner! Welcome to ADAMAS Feedback Bot. 🤠', type: 'system' }
      ]
    }, () => {
      console.log('ADAMAS Feedback Bot initialized successfully with Manifest V3!');
    });
  }
});
