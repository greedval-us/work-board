import { AppHandler } from './AppHandler.js';
import { SettingsHandler } from './SettingsHandler.js';
import { registerIpcHandlers } from './registerIpcHandlers.js';
import { isWindowMainFrame } from './isWindowMainFrame.js';
import { BusinessHandler } from './BusinessHandler.js';
import { IPC_CHANNELS } from '../../shared/ipc/channels.js';
import { IPC_SIGNALS } from '../../shared/ipc/events.js';

const lockChannels = IPC_CHANNELS.appLock;
const LOCK_SCREEN_CHANNELS = new Set([lockChannels.getStatus, lockChannels.unlock, lockChannels.hasPendingNotifications]);
const APPEARANCE_CHANGE_CHANNELS = new Set([
  IPC_CHANNELS.database.create, IPC_CHANNELS.database.open, IPC_CHANNELS.settings.setTheme, IPC_CHANNELS.settings.setAppearanceStyle,
]);

const REMINDER_CHANGE_CHANNELS = new Set([
  IPC_CHANNELS.database.create, IPC_CHANNELS.database.open,
  IPC_CHANNELS.instructions.closeControl,
  IPC_CHANNELS.plans.closeControl, IPC_CHANNELS.settings.setPlanningEnabled,
  IPC_CHANNELS.tasks.setOccurrenceCompleted,
  IPC_CHANNELS.tasks.moveOccurrence,
  ...['instructions', 'plans', 'tasks'].flatMap(entity => ['create', 'update', 'remove'].map(method => IPC_CHANNELS[entity][method])),
]);

export class IPCManager {
  #unregister = null;

  constructor(options) {
    this.options = options;
  }

  init() {
    if (this.#unregister) return;
    const { ipcMain, appService, database, settingsService, getWindow, logger, selection, recordServices,
      appLock, hasPendingNotifications } = this.options;
    const isTrusted = event => isWindowMainFrame(getWindow(), event);
    const unregister = registerIpcHandlers({
      ipcMain,
      logger,
      isTrusted,
      authorize(channel) {
        if (!LOCK_SCREEN_CHANNELS.has(channel)) appLock?.assertUnlocked();
      },
      onSuccess: channel => {
        if (APPEARANCE_CHANGE_CHANNELS.has(channel)) this.options.onAppearanceChanged?.();
        if (REMINDER_CHANGE_CHANNELS.has(channel)) this.options.onDataChanged?.();
      },
      requests: {
        ...new AppHandler(appService, database).requests(),
        ...new SettingsHandler(settingsService, database).requests(),
        ...(appLock ? {
          [lockChannels.getStatus]: () => appLock.getStatus(),
          [lockChannels.configure]: payload => appLock.configure(payload),
          [lockChannels.lock]: () => appLock.lock(),
          [lockChannels.unlock]: payload => appLock.unlock(payload),
          [lockChannels.hasPendingNotifications]: () => hasPendingNotifications(),
        } : {}),
        ...(selection ? {
          [IPC_CHANNELS.database.create]: () => selection.create(),
          [IPC_CHANNELS.database.open]: () => selection.open(),
        } : {}),
        ...(recordServices ? new BusinessHandler(this.options).requests() : {}),
      },
    });
    const onActivity = event => { if (isTrusted(event)) appLock.recordActivity(); };
    try { if (appLock) ipcMain.on(IPC_SIGNALS.appActivity, onActivity); }
    catch (error) { unregister(); throw error; }
    this.#unregister = () => {
      if (appLock) ipcMain.removeListener(IPC_SIGNALS.appActivity, onActivity);
      unregister();
    };
  }

  shutdown() { this.#unregister?.(); this.#unregister = null; }
}
