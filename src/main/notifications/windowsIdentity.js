// Must match electron-builder.config.cjs and the installed Start menu shortcut.
export const APP_USER_MODEL_ID = 'com.workboard.desktop';

// Call before creating a Notification or checking Notification.isSupported().
// NSIS installs the matching shortcut; portable/dev notification delivery is
// best effort because setting the process identity does not install a shortcut.
export function registerWindowsAppIdentity({ app, platform = process.platform }) {
  if (platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);
}
