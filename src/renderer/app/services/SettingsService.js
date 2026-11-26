import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const settingsService = createDesktopService({
  get: ['settings', 'get'],
  setTheme: ['settings', 'setTheme'],
  setAppearanceStyle: ['settings', 'setAppearanceStyle'],
  setTypography: ['settings', 'setTypography'],
  setPlanningEnabled: ['settings', 'setPlanningEnabled'],
  setOffice: ['settings', 'setOffice'],
  addRegistryOption: ['settings', 'addRegistryOption'],
  updateRegistryOption: ['settings', 'updateRegistryOption'],
  removeRegistryOption: ['settings', 'removeRegistryOption'],
});
