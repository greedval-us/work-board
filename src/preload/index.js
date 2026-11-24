import { contextBridge, ipcRenderer } from 'electron';
import { createPreloadApis } from './createPreloadApis.js';
import { IPC_SIGNALS } from '../shared/ipc/events.js';
import { appearanceFromSearch, applyStartupAppearance } from '../shared/startupAppearance.js';

contextBridge.exposeInMainWorld('desktopAPI', createPreloadApis(ipcRenderer));

// Seed the first paint even if the startup module is still loading.
function applyInitialColors() {
  applyStartupAppearance(document.documentElement, appearanceFromSearch(window.location.search),
    window.matchMedia('(prefers-color-scheme: dark)').matches);
}
if (document.documentElement) applyInitialColors();
else {
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    applyInitialColors();
  });
  observer.observe(document, { childList: true });
}

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
