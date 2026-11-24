import { IPC_CHANNELS as channels } from '../shared/ipc/channels.js';
import { IPC_EVENTS } from '../shared/ipc/events.js';
import { APP_LOCK_TIMEOUT_MINUTES } from '../shared/appLock.js';

// Keep results as plain envelopes: Error custom fields do not survive contextBridge.
// Never expose ipcRenderer, arbitrary channels, filesystem paths or SQL execution.
export function createPreloadApis(ipcRenderer) {
  const payloadMethods = namespace => Object.fromEntries(Object.entries(namespace)
    .map(([method, channel]) => [method, payload => ipcRenderer.invoke(channel, payload)]));
  return {
    app: { getInfo: () => ipcRenderer.invoke(channels.app.getInfo) },
    appLock: {
      getStatus: () => ipcRenderer.invoke(channels.appLock.getStatus),
      configure: payload => ipcRenderer.invoke(channels.appLock.configure, payload),
      lock: () => ipcRenderer.invoke(channels.appLock.lock),
      unlock: payload => ipcRenderer.invoke(channels.appLock.unlock, payload),
      hasPendingNotifications: () => ipcRenderer.invoke(channels.appLock.hasPendingNotifications),
      onStatusChanged(callback) {
        if (typeof callback !== 'function') throw new TypeError('App lock listener is required.');
        const listener = (_event, payload) => {
          const { enabled, locked, timeoutMinutes } = payload ?? {};
          if (typeof enabled === 'boolean' && typeof locked === 'boolean' && (!locked || enabled)
            && APP_LOCK_TIMEOUT_MINUTES.includes(timeoutMinutes)) callback({ enabled, locked, timeoutMinutes });
        };
        ipcRenderer.on(IPC_EVENTS.appLockStatusChanged, listener);
        return () => ipcRenderer.removeListener(IPC_EVENTS.appLockStatusChanged, listener);
      },
    },
    database: {
      getStatus: () => ipcRenderer.invoke(channels.database.getStatus),
      create: () => ipcRenderer.invoke(channels.database.create),
      open: () => ipcRenderer.invoke(channels.database.open),
    },
    settings: {
      get: (generation) => ipcRenderer.invoke(channels.settings.get, { generation }),
      setTheme: (theme, generation) => ipcRenderer.invoke(channels.settings.setTheme, { theme, generation }),
      setAppearanceStyle: (appearanceStyle, generation) => ipcRenderer.invoke(channels.settings.setAppearanceStyle, { appearanceStyle, generation }),
      setTypography: (typography, generation) => ipcRenderer.invoke(channels.settings.setTypography, { typography, generation }),
      setOffice: (office, generation) => ipcRenderer.invoke(channels.settings.setOffice, { office, generation }),
      addRegistryOption: (field, value, generation, contact) => ipcRenderer.invoke(channels.settings.addRegistryOption, {
        field, value, generation, ...(contact === undefined ? {} : { contact }),
      }),
      updateRegistryOption: (field, previousValue, value, generation, contact) => ipcRenderer.invoke(channels.settings.updateRegistryOption, {
        field, previousValue, value, generation, ...(contact === undefined ? {} : { contact }),
      }),
      removeRegistryOption: (field, value, generation) => ipcRenderer.invoke(channels.settings.removeRegistryOption, { field, value, generation }),
      setExecutorContact: (executor, contact, generation) => ipcRenderer.invoke(channels.settings.setExecutorContact, { executor, contact, generation }),
    },
    instructions: payloadMethods(channels.instructions),
    tasks: payloadMethods(channels.tasks),
    calendar: payloadMethods(channels.calendar),
    analytics: payloadMethods(channels.analytics),
    notifications: {
      ...payloadMethods(channels.notifications),
      onOpen(callback) {
        if (typeof callback !== 'function') throw new TypeError('Notification listener is required.');
        const listener = (_event, payload) => {
          if (Number.isSafeInteger(payload?.generation) && payload.generation >= 0) callback({ generation: payload.generation });
        };
        ipcRenderer.on(IPC_EVENTS.notificationOpen, listener);
        return () => ipcRenderer.removeListener(IPC_EVENTS.notificationOpen, listener);
      },
    },
  };
}
