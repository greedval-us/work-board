import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createWindow } from './app.js';
import { createApplicationServices } from './createApplicationServices.js';
import log from './utils/logger.js';

app.setName('Work Board');
let mainWindow = null;
let services = null;
let quitting = false;

function openWindow() {
  const { window, loaded } = createWindow();
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  let resolvingClose = false;
  window.webContents.on('will-prevent-unload', async () => {
    if (resolvingClose) return;
    resolvingClose = true;
    try {
      const allowed = await window.webContents.executeJavaScript(`(async () => {
        const allowed = await window.__workBoardConfirmClose?.();
        if (allowed) window.__workBoardAllowClose = true;
        return allowed;
      })()`);
      if (allowed) { if (quitting) app.quit(); else window.close(); }
      else quitting = false;
    } catch (error) { log.error('Failed to resolve unsaved changes:', error); }
    finally { resolvingClose = false; }
  });
  loaded.catch(failStartup);
}

function failStartup(error) {
  log.error('Failed to start Work Board:', error);
  dialog.showErrorBox('Не удалось открыть Work Board',
    'Проверьте доступ к папке данных приложения. Подробности записаны в журнале.');
  app.quit();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    services = createApplicationServices({ app, ipcMain, dialog, getWindow: () => mainWindow, logger: log });
    openWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
  }).catch(failStartup);
}

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  services?.shutdown();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
