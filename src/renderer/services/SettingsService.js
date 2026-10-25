import { requestDesktop } from '../infrastructure/desktopApi.js';

export const settingsService = {
  get: (generation) => requestDesktop('settings', 'get', generation),
  setTheme: (theme, generation) => requestDesktop('settings', 'setTheme', theme, generation),
};
