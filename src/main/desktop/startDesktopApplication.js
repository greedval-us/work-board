import { WindowLifecycle } from './WindowLifecycle.js';
import { isWindowMainFrame } from '../ipc/isWindowMainFrame.js';
import { IPC_EVENTS, IPC_SIGNALS, STARTUP_CHANNEL } from '../../shared/ipc/events.js';

// Inject platform capabilities so tests never publish reminders to the user's desktop.
export function startDesktopApplication({ app, dialog, ipcMain, createWindow, createServices,
  createTray, buildMenu, logger, platform = process.platform }) {
  app.setName('Work Board');
  let mainWindow = null;
  let windowPainted = false;
  let services;
  let listeningForNotifications = false;
  let pendingNotificationOpen = null;
  const lifecycle = new WindowLifecycle({ app, getWindow: () => mainWindow, createTray, buildMenu, logger, platform,
    beforeRestore: () => services?.getAppLockStatus(),
  });

  function failStartup(error) {
    if (lifecycle.quitting) return;
    logger.error('Failed to start Work Board:', error);
    dialog.showErrorBox('Не удалось открыть Work Board',
      'Проверьте доступ к папке данных приложения. Подробности записаны в журнале.');
    lifecycle.requestQuit();
  }

  function openWindow() {
    const created = createWindow();
    mainWindow = created.window;
    windowPainted = false;
    listeningForNotifications = false;
    const window = mainWindow;
    lifecycle.attachWindow(window);
    window.on('focus', () => services?.getAppLockStatus());
    window.webContents.on('did-navigate', () => { listeningForNotifications = false; });
    created.loaded.catch(error => { if (!window.isDestroyed()) failStartup(error); });
    return new Promise(resolve => {
      window.once('ready-to-show', () => {
        if (!lifecycle.quitting) {
          windowPainted = true;
          window.show();
        }
        resolve();
      });
      window.once('closed', () => {
        if (mainWindow === window) mainWindow = null;
        resolve();
      });
    });
  }

  function restoreWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) openWindow();
    if (windowPainted) lifecycle.restoreWindow();
  }

  function flushNotificationOpen() {
    if (!pendingNotificationOpen || !listeningForNotifications || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      if (services.getAppLockStatus().locked) return;
      mainWindow.webContents.send(IPC_EVENTS.notificationOpen, pendingNotificationOpen);
      pendingNotificationOpen = null;
    } catch (error) { logger.error('Cannot open native notification.', error); }
  }

  function onNotificationOpen({ generation }) {
    pendingNotificationOpen = { generation };
    restoreWindow();
    flushNotificationOpen();
  }

  function onAppLockStatusChange(status) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_EVENTS.appLockStatusChanged, status);
    }
    if (!status.locked) flushNotificationOpen();
  }

  function onNotificationListening(event) {
    if (!isWindowMainFrame(mainWindow, event)) return;
    listeningForNotifications = true;
    flushNotificationOpen();
  }

  app.on('before-quit', () => lifecycle.beforeQuit());
  app.on('will-quit', () => {
    ipcMain.removeHandler(STARTUP_CHANNEL);
    ipcMain.removeListener(IPC_SIGNALS.notificationListening, onNotificationListening);
    lifecycle.shutdown();
    services?.shutdown();
  });
  app.on('window-all-closed', () => { if (platform !== 'darwin') lifecycle.requestQuit(); });

  let ready = Promise.resolve();
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on('second-instance', () => { if (mainWindow) restoreWindow(); });
    ready = app.whenReady().then(async () => {
      ipcMain.handle(STARTUP_CHANNEL, async event => {
        if (!isWindowMainFrame(mainWindow, event)) throw new Error('Недопустимый источник запроса.');
        await ready;
        if (!services || lifecycle.quitting) throw new Error('Не удалось открыть Work Board.');
        return services.getStartupAppearance();
      });
      ipcMain.on(IPC_SIGNALS.notificationListening, onNotificationListening);
      const painted = openWindow();
      app.on('activate', restoreWindow);
      await painted;
      if (lifecycle.quitting) return;
      lifecycle.initializeTray();
      const initialized = await createServices({ app, ipcMain, dialog, getWindow: () => mainWindow, logger,
        onNotificationOpen, onAppLockStatusChange,
      });
      if (lifecycle.quitting) {
        initialized.shutdown();
        return;
      }
      services = initialized;
      services.startNotifications();
    }).catch(failStartup);
  }
  return { ready, lifecycle, getWindow: () => mainWindow, getServices: () => services };
}
