import { app, BrowserWindow, Menu } from 'electron';
import { fileURLToPath } from 'node:url';

export function createWindow() {
  const window = new BrowserWindow({
    title: 'Work Board',
    icon: fileURLToPath(new URL('../../build/renderer/icons/app-256.png', import.meta.url)),
    width: 1200, height: 780, minWidth: 720, minHeight: 540,
    show: false, backgroundColor: '#edeef2',
    webPreferences: {
      preload: fileURLToPath(new URL('../../build/main/preload.cjs', import.meta.url)),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window.show());

  const devUrl = !app.isPackaged && process.env.WORK_BOARD_DEV_SERVER_URL;
  if (devUrl && devUrl !== 'http://127.0.0.1:5173') {
    window.destroy();
    throw new Error('Недопустимый адрес Vite. Ожидается http://127.0.0.1:5173.');
  }
  const loaded = devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(fileURLToPath(new URL('../../build/renderer/index.html', import.meta.url)));
  if (devUrl && process.env.WORK_BOARD_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  return { window, loaded };
}
