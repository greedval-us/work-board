// Main-to-renderer capabilities are separate from the request allowlist.
export const IPC_EVENTS = Object.freeze({
  notificationOpen: 'notifications:open',
  appLockStatusChanged: 'app-lock:status-changed',
});

// Bootstrap is available before the database-backed request handlers exist.
export const STARTUP_CHANNEL = 'app:when-ready';

// One-way input from the isolated preload.
export const IPC_SIGNALS = Object.freeze({
  appActivity: 'app-lock:activity', notificationListening: 'notifications:listening',
});
