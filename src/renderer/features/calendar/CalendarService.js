import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const calendarService = createDesktopService({
  month: ['calendar', 'month'],
  day: ['calendar', 'day'],
  year: ['calendar', 'year'],
});
