import { createDesktopService } from '../infrastructure/desktopApi.js';

export const notificationService = createDesktopService({
  list: ['notifications', 'list'],
  acknowledge: ['notifications', 'acknowledge'],
});

export function subscribeNotificationOpen(callback) {
  // A narrow event capability; the Electron event object never crosses preload.
  return globalThis.window?.desktopAPI?.notifications?.onOpen?.(callback) ?? (() => {});
}
