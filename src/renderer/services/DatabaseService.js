import { requestDesktop } from '../infrastructure/desktopApi.js';

export const databaseService = {
  create: () => requestDesktop('database', 'create'),
  open: () => requestDesktop('database', 'open'),
};
