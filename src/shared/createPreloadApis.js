import { IPC_CHANNELS as channels } from './constants/ipcChannels.js';

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
    },
    instructions: payloadMethods(channels.instructions),
    tasks: payloadMethods(channels.tasks),
    calendar: payloadMethods(channels.calendar),
    attachments: payloadMethods(channels.attachments),
    analytics: payloadMethods(channels.analytics),
  };
}
