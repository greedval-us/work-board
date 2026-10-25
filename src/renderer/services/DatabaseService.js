import { createDesktopService } from '../infrastructure/desktopApi.js';

export const databaseService = createDesktopService({
  create: ['database', 'create'],
  open: ['database', 'open'],
});
