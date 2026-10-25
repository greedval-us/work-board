import { createDesktopService } from '../infrastructure/desktopApi.js';

export const registryService = createDesktopService({
  list: ['instructions', 'list'],
  get: ['instructions', 'get'],
  create: ['instructions', 'create'],
  update: ['instructions', 'update'],
  remove: ['instructions', 'remove'],
  export: ['instructions', 'export'],
});
