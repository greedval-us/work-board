import { createDesktopService } from '../infrastructure/desktopApi.js';

export const settingsService = createDesktopService({
  get: ['settings', 'get'],
  setTheme: ['settings', 'setTheme'],
});
