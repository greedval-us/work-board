import { createDesktopService } from '../infrastructure/desktopApi.js';

export const appService = createDesktopService({
  getInfo: ['app', 'getInfo'],
  getDatabaseStatus: ['database', 'getStatus'],
});
