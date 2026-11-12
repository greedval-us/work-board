import { app, BrowserWindow, Menu } from 'electron';
import { appPath } from './utils/appPaths.js';
import { DEV_SERVER } from '../shared/constants/runtime.js';
import { WINDOW_OPTIONS } from './config/window.js';

export function createWindow() {
  const window = new BrowserWindow({
    title: 'Work Board',
    icon: appPath('build/renderer/icons/app-256.png'),
    ...WINDOW_OPTIONS,
    webPreferences: {
      preload: appPath('build/main/preload.cjs'),
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
    : window.loadFile(appPath('build/renderer/index.html'));
  if (devUrl && process.env.WORK_BOARD_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' });
  return { window, loaded };
}
