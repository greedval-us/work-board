import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const registryService = createDesktopService({
  list: ['instructions', 'list'],
  get: ['instructions', 'get'],
  create: ['instructions', 'create'],
  update: ['instructions', 'update'],
  remove: ['instructions', 'remove'],
  closeControl: ['instructions', 'closeControl'],
  export: ['instructions', 'export'],
  exportControlCard: ['instructions', 'exportControlCard'],
});
