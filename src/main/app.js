import { app, BrowserWindow, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { DEV_SERVER } from '../shared/constants/runtime.js';
import { WINDOW_OPTIONS } from './config/window.js';

export function createWindow() {
  const window = new BrowserWindow({
    title: 'Work Board',
    icon: fileURLToPath(new URL('../../build/renderer/icons/app-256.png', import.meta.url)),
    ...WINDOW_OPTIONS,
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
  if (devUrl && devUrl !== DEV_SERVER.URL) {
    window.destroy();
    throw new Error(`Недопустимый адрес Vite. Ожидается ${DEV_SERVER.URL}.`);
  }
  const loaded = devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(fileURLToPath(new URL('../../build/renderer/index.html', import.meta.url)));
  if (devUrl && process.env.WORK_BOARD_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  return { window, loaded };
}
