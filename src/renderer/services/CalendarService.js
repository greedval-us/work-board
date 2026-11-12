import { createDesktopService } from '../infrastructure/desktopApi.js';

export const calendarService = createDesktopService({
  month: ['calendar', 'month'],
  day: ['calendar', 'day'],
  getTask: ['tasks', 'get'],
  createTask: ['tasks', 'create'],
  updateTask: ['tasks', 'update'],
  removeTask: ['tasks', 'remove'],
});
