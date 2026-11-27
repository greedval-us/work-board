import { createDesktopService } from '../../infrastructure/desktopApi.js';

export const taskService = createDesktopService({
  listTasks: ['tasks', 'list'],
  getTask: ['tasks', 'get'],
  createTask: ['tasks', 'create'],
  updateTask: ['tasks', 'update'],
  setOccurrenceCompleted: ['tasks', 'setOccurrenceCompleted'],
  moveOccurrence: ['tasks', 'moveOccurrence'],
  removeTask: ['tasks', 'remove'],
});
