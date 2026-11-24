import { app, dialog, ipcMain, Menu, Notification, powerMonitor, shell, Tray } from 'electron';
import { appPath } from './runtime/appPaths.js';
import { createWindow } from './desktop/createWindow.js';
import { createApplicationServices } from './createApplicationServices.js';
import { startDesktopApplication } from './desktop/startDesktopApplication.js';
import { registerWindowsAppIdentity } from './desktop/windowsIdentity.js';
import log from './runtime/logger.js';

registerWindowsAppIdentity({ app });
const icon = appPath('build/renderer/icons/app.ico');
startDesktopApplication({
  app, dialog, ipcMain, createWindow, logger: log,
  createTray: () => new Tray(icon), buildMenu: template => Menu.buildFromTemplate(template),
  createServices: options => createApplicationServices({ ...options,
    openPath: filePath => shell.openPath(filePath),
    // Electron 22 cannot reliably remove an expired preview from Windows Action Center.
    hideLegacyNotificationPreviews: process.versions.electron.split('.')[0] === '22',
    nativeNotifications: process.platform === 'win32' ? {
      createNotification: options => new Notification({ ...options, icon }),
      isSupported: () => Notification.isSupported(), powerMonitor,
    } : undefined,
  }),
});
