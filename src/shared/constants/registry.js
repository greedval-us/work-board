import { controlColumns } from './control.js';

export const INSTRUCTION_STATUS = Object.freeze({
  PENDING: 'pending', IN_PROGRESS: 'in_progress', COMPLETED: 'completed',
});

export const TASK_PRIORITY = Object.freeze({ NORMAL: 'normal', IMPORTANT: 'important', URGENT: 'urgent' });

export const INSTRUCTION_STATUSES = Object.freeze({
  [INSTRUCTION_STATUS.PENDING]: 'На контроле',
  [INSTRUCTION_STATUS.IN_PROGRESS]: 'В работе',
  [INSTRUCTION_STATUS.COMPLETED]: 'Исполнено',
});

export const CHECKPOINT_FILTER_LABELS = Object.freeze({ overdue: 'Просрочено', today: 'На сегодня' });

export const TASK_PRIORITIES = Object.freeze({
  [TASK_PRIORITY.NORMAL]: 'Обычная', [TASK_PRIORITY.IMPORTANT]: 'Важная', [TASK_PRIORITY.URGENT]: 'Срочная',
});

export const TASK_PRIORITY_TONES = Object.freeze({
  [TASK_PRIORITY.NORMAL]: 'info', [TASK_PRIORITY.IMPORTANT]: 'warning', [TASK_PRIORITY.URGENT]: 'danger',
});

export const INSTRUCTION_COLUMNS = controlColumns('Название указания');
export { CONTROL_FIELDS as INSTRUCTION_FIELDS } from './control.js';
export const TASK_FIELDS = Object.freeze(['title', 'date', 'description', 'priority', 'completed']);
export const REGISTRY_PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1, DEFAULT_SIZE: 25, SIZES: Object.freeze([25, 50, 100]), MAX_SIZE: 100, DEFAULT_OFFSET: 0,
});
export const REGISTRY_DEFAULT_SORT = Object.freeze({ field: 'controlDate', direction: 'desc' });
export const REGISTRY_REPORT_TYPE = Object.freeze({ FULL: 'full', SHORT: 'short', OVERDUE: 'overdue' });
export const REGISTRY_REPORT_LABELS = Object.freeze({
  [REGISTRY_REPORT_TYPE.FULL]: 'Полный отчёт',
  [REGISTRY_REPORT_TYPE.SHORT]: 'Краткий отчёт',
  [REGISTRY_REPORT_TYPE.OVERDUE]: 'Просроченные контроли',
});
export const SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);
export const URGENCY_WINDOW_DAYS = 3;
