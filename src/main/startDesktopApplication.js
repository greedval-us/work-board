import { WindowLifecycle } from './lifecycle/WindowLifecycle.js';
import { IPC_EVENTS } from '../shared/constants/ipcEvents.js';

// Inject platform capabilities so tests never publish reminders to the user's desktop.
export function startDesktopApplication({ app, dialog, ipcMain, createWindow, createServices,
  createTray, buildMenu, logger, platform = process.platform }) {
  app.setName('Work Board');
  let mainWindow = null;
  let loaded = Promise.resolve();
  let services;
  const lifecycle = new WindowLifecycle({ app, getWindow: () => mainWindow, createTray, buildMenu, logger, platform });

  function failStartup(error) {
    logger.error('Failed to start Work Board:', error);
    dialog.showErrorBox('Не удалось открыть Work Board',
      'Проверьте доступ к папке данных приложения. Подробности записаны в журнале.');
    lifecycle.requestQuit();
  }

  function openWindow() {
    const created = createWindow();
    mainWindow = created.window;
    loaded = created.loaded;
    const window = mainWindow;
    lifecycle.attachWindow(window);
    window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
    loaded.catch(failStartup);
    return window;
  }

  function restoreWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) openWindow();
    return lifecycle.restoreWindow();
  }

  async function onNotificationOpen({ generation }) {
    const window = restoreWindow();
    await loaded;
    if (window && !window.isDestroyed()) window.webContents.send(IPC_EVENTS.notificationOpen, { generation });
  }

  app.on('before-quit', () => lifecycle.beforeQuit());
  app.on('will-quit', () => { lifecycle.shutdown(); services?.shutdown(); });
  app.on('window-all-closed', () => { if (platform !== 'darwin') lifecycle.requestQuit(); });

  let ready = Promise.resolve();
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on('second-instance', () => { if (mainWindow) restoreWindow(); });
    ready = app.whenReady().then(() => {
      services = createServices({ app, ipcMain, dialog, getWindow: () => mainWindow, logger, onNotificationOpen });
      openWindow();
      lifecycle.initializeTray();
      services.startNotifications();
      app.on('activate', restoreWindow);
    }).catch(failStartup);
  }
  return { ready, lifecycle, getWindow: () => mainWindow, getServices: () => services };
}
