import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApis } from '../shared/createPreloadApis.js';

contextBridge.exposeInMainWorld('desktopAPI', createPreloadApis(ipcRenderer));
