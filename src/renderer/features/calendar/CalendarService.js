import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const calendarService = createDesktopService({
  month: ['calendar', 'month'],
  day: ['calendar', 'day'],
  year: ['calendar', 'year'],
  getTask: ['tasks', 'get'],
  createTask: ['tasks', 'create'],
  updateTask: ['tasks', 'update'],
  setOccurrenceCompleted: ['tasks', 'setOccurrenceCompleted'],
  moveOccurrence: ['tasks', 'moveOccurrence'],
  removeTask: ['tasks', 'remove'],
});
