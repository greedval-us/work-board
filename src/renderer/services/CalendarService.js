import { createDesktopService } from '../infrastructure/desktopApi.js';

export const calendarService = createDesktopService({
  month: ['calendar', 'month'],
  day: ['calendar', 'day'],
  createTask: ['tasks', 'create'],
  updateTask: ['tasks', 'update'],
  removeTask: ['tasks', 'remove'],
});
