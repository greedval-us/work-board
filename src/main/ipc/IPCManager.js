import { AppHandler } from './AppHandler.js';
import { SettingsHandler } from './SettingsHandler.js';
import { registerIpcHandlers } from './registerIpcHandlers.js';
import { BusinessHandler } from './BusinessHandler.js';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels.js';

export class IPCManager {
  #unregister = null;

  constructor(options) {
    this.options = options;
  }

  init() {
    if (this.#unregister) return;
    const { ipcMain, appService, database, settingsService, getWindow, logger, selection, recordServices } = this.options;
    this.#unregister = registerIpcHandlers({
      ipcMain,
      logger,
      requests: {
        ...new AppHandler(appService, database).requests(),
        ...new SettingsHandler(settingsService, database).requests(),
        ...(selection ? {
          [IPC_CHANNELS.database.create]: () => selection.create(),
          [IPC_CHANNELS.database.open]: () => selection.open(),
        } : {}),
        ...(recordServices ? new BusinessHandler(this.options).requests() : {}),
      },
      isTrusted(event) {
        const window = getWindow();
        return Boolean(window && !window.isDestroyed()
          && event.sender === window.webContents
          && event.senderFrame === window.webContents.mainFrame);
      },
    });
  }

  shutdown() { this.#unregister?.(); this.#unregister = null; }
}
