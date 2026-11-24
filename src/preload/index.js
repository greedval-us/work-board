import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApis } from './createPreloadApis.js';
import { IPC_SIGNALS } from '../shared/ipc/events.js';

contextBridge.exposeInMainWorld('desktopAPI', createPreloadApis(ipcRenderer));

let lastActivity = -Infinity;
function reportActivity(event) {
  if (!event.isTrusted) return;
  const now = performance.now();
  if (now - lastActivity < 250) return;
  lastActivity = now;
  ipcRenderer.send(IPC_SIGNALS.appActivity);
}
for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel']) {
  window.addEventListener(type, reportActivity, { capture: true, passive: true });
}
