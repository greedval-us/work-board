import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApis } from './createPreloadApis.js';

contextBridge.exposeInMainWorld('desktopAPI', createPreloadApis(ipcRenderer));
