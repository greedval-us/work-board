import { createDesktopService } from '../infrastructure/desktopApi.js';

export const settingsService = createDesktopService({
  get: ['settings', 'get'],
  setTheme: ['settings', 'setTheme'],
  addRegistryOption: ['settings', 'addRegistryOption'],
  updateRegistryOption: ['settings', 'updateRegistryOption'],
  removeRegistryOption: ['settings', 'removeRegistryOption'],
  setExecutorContact: ['settings', 'setExecutorContact'],
});
