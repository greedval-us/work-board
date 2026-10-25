import { requestDesktop } from '../infrastructure/desktopApi.js';

export const calendarService = {
  month: (request) => requestDesktop('calendar', 'month', request),
  day: (request) => requestDesktop('calendar', 'day', request),
  createTask: (request) => requestDesktop('tasks', 'create', request),
  updateTask: (request) => requestDesktop('tasks', 'update', request),
  removeTask: (request) => requestDesktop('tasks', 'remove', request),
};
