import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const planningService = createDesktopService({
  list: ['plans', 'list'],
  get: ['plans', 'get'],
  create: ['plans', 'create'],
  update: ['plans', 'update'],
  remove: ['plans', 'remove'],
  closeControl: ['plans', 'closeControl'],
  export: ['plans', 'export'],
});
