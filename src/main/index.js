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
    nativeNotifications: process.platform === 'win32' ? {
      createNotification: options => new Notification({ ...options, icon }),
      isSupported: () => Notification.isSupported(), powerMonitor,
    } : undefined,
  }),
});
