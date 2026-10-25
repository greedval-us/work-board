import { requestDesktop } from '../infrastructure/desktopApi.js';

export const appService = {
  getInfo: () => requestDesktop('app', 'getInfo'),
  getDatabaseStatus: () => requestDesktop('database', 'getStatus'),
};
