// Main-to-renderer capabilities are separate from the request allowlist.
export const IPC_EVENTS = Object.freeze({
  notificationOpen: 'notifications:open',
  appLockStatusChanged: 'app-lock:status-changed',
});

// One-way input from the isolated preload, outside the page's desktop API.
export const IPC_SIGNALS = Object.freeze({ appActivity: 'app-lock:activity' });
