import { requestDesktop } from '../infrastructure/desktopApi.js';

export const registryService = {
  list: (request) => requestDesktop('instructions', 'list', request),
  get: (request) => requestDesktop('instructions', 'get', request),
  create: (request) => requestDesktop('instructions', 'create', request),
  update: (request) => requestDesktop('instructions', 'update', request),
  remove: (request) => requestDesktop('instructions', 'remove', request),
  export: (request) => requestDesktop('instructions', 'export', request),
};
