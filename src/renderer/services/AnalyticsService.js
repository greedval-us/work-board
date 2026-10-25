import { createDesktopService } from '../infrastructure/desktopApi.js';

export const analyticsService = createDesktopService({ summary: ['analytics', 'summary'] });
