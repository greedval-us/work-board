import { createDesktopService } from '../infrastructure/desktopApi.js';

export const attachmentService = createDesktopService({
  list: ['attachments', 'list'],
  pick: ['attachments', 'pick'],
  release: ['attachments', 'release'],
  download: ['attachments', 'download'],
});
