import { app, dialog, ipcMain, Menu, Notification, powerMonitor, Tray } from 'electron';
import { appPath } from './utils/appPaths.js';
import { createWindow } from './app.js';
import { createApplicationServices } from './createApplicationServices.js';
import { startDesktopApplication } from './startDesktopApplication.js';
import { registerWindowsAppIdentity } from './notifications/windowsIdentity.js';
import log from './utils/logger.js';

registerWindowsAppIdentity({ app });
const icon = appPath('build/renderer/icons/app.ico');
startDesktopApplication({
  app, dialog, ipcMain, createWindow, logger: log,
  createTray: () => new Tray(icon), buildMenu: template => Menu.buildFromTemplate(template),
  createServices: options => createApplicationServices({ ...options,
    nativeNotifications: process.platform === 'win32' ? {
      createNotification: options => new Notification({ ...options, icon }),
      isSupported: () => Notification.isSupported(), powerMonitor,
    } : undefined,
  }),
});
