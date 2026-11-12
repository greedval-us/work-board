import { IPC_CHANNELS as channels } from './constants/ipcChannels.js';
import { IPC_EVENTS } from './constants/ipcEvents.js';

// Keep results as plain envelopes: Error custom fields do not survive contextBridge.
// Never expose ipcRenderer, arbitrary channels, filesystem paths or SQL execution.
export function createPreloadApis(ipcRenderer) {
  const payloadMethods = namespace => Object.fromEntries(Object.entries(namespace)
    .map(([method, channel]) => [method, payload => ipcRenderer.invoke(channel, payload)]));
  return {
    app: { getInfo: () => ipcRenderer.invoke(channels.app.getInfo) },
    database: {
      getStatus: () => ipcRenderer.invoke(channels.database.getStatus),
      create: () => ipcRenderer.invoke(channels.database.create),
      open: () => ipcRenderer.invoke(channels.database.open),
    },
    settings: {
      get: (generation) => ipcRenderer.invoke(channels.settings.get, { generation }),
      setTheme: (theme, generation) => ipcRenderer.invoke(channels.settings.setTheme, { theme, generation }),
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
    attachments: payloadMethods(channels.attachments),
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
