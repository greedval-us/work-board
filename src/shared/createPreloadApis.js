import { IPC_CHANNELS as channels } from './constants/ipcChannels.js';

// Keep results as plain envelopes: Error custom fields do not survive contextBridge.
// Never expose ipcRenderer, arbitrary channels, filesystem paths or SQL execution.
export function createPreloadApis(ipcRenderer) {
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
    instructions: {
      list: (payload) => ipcRenderer.invoke(channels.instructions.list, payload),
      get: (payload) => ipcRenderer.invoke(channels.instructions.get, payload),
      create: (payload) => ipcRenderer.invoke(channels.instructions.create, payload),
      update: (payload) => ipcRenderer.invoke(channels.instructions.update, payload),
      remove: (payload) => ipcRenderer.invoke(channels.instructions.remove, payload),
      export: (payload) => ipcRenderer.invoke(channels.instructions.export, payload),
    },
    tasks: {
      list: (payload) => ipcRenderer.invoke(channels.tasks.list, payload),
      get: (payload) => ipcRenderer.invoke(channels.tasks.get, payload),
      create: (payload) => ipcRenderer.invoke(channels.tasks.create, payload),
      update: (payload) => ipcRenderer.invoke(channels.tasks.update, payload),
      remove: (payload) => ipcRenderer.invoke(channels.tasks.remove, payload),
    },
    calendar: {
      month: (payload) => ipcRenderer.invoke(channels.calendar.month, payload),
      day: (payload) => ipcRenderer.invoke(channels.calendar.day, payload),
    },
  };
}
