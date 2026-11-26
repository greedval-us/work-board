import { ValidationError } from './errors.js';
import { validateDate, localDate, addCalendarDays } from './dates.js';
import { validateRecord as record, validateText as text, validateEnum as enumValue } from './validation.js';
import { effectiveDeadline, validateControlFields } from './controlRecord.js';
import { validateTaskRecurrence } from './taskRecurrence.js';
import {
  INSTRUCTION_STATUSES, INSTRUCTION_STATUS, TASK_PRIORITIES, TASK_PRIORITY, TASK_PRIORITY_TONES, URGENCY_WINDOW_DAYS,
} from './constants/registry.js';

// Stable domain entry point for existing consumers; concerns live in focused modules.
export * from './constants/registry.js';
export { emptyFilters, normalizeExportRequest, normalizeFilters, normalizeListRequest } from './registryRequests.js';
export { daysInMonth, validateDate, localDate, formatDate, addCalendarDays } from './dates.js';
export { validateId } from './validation.js';
export { ValidationError } from './errors.js';

export function validateInstruction(value) {
  return validateControlFields(record(value, 'Указание'), 'Название указания');
}

export function validateTask(value) {
  const data = record(value, 'Задача');
  const completed = data.completed === undefined ? false : data.completed;
  if (typeof completed !== 'boolean') throw new ValidationError('Выполнение задачи: укажите да или нет.');
  const date = validateDate(data.date, 'Дата задачи');
  const recurrence = validateTaskRecurrence(data.recurrence, date);
  return {
    title: text(data.title, 'Название задачи', true),
    date,
    description: text(data.description, 'Описание задачи'),
    priority: enumValue(data.priority === undefined ? TASK_PRIORITY.NORMAL : data.priority, TASK_PRIORITIES, 'Срочность'),
    completed,
    ...(recurrence ? { recurrence } : {}),
  };
}

export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

export { effectiveDeadline as instructionDeadline };

export function getUrgency(item, today = localDate()) {
  const isTask = Object.hasOwn(item, 'date');
  if (isTask ? item.completed : item.status === INSTRUCTION_STATUS.COMPLETED) {
    return { tone: 'success', label: isTask ? 'Выполнено' : INSTRUCTION_STATUSES[INSTRUCTION_STATUS.COMPLETED] };
  }
  const date = isTask ? item.date : effectiveDeadline(item);
  if (date < today) return { tone: 'danger', label: 'Просрочено' };
  if (isTask) {
    const priority = item.priority ?? TASK_PRIORITY.NORMAL;
    return { tone: TASK_PRIORITY_TONES[priority], label: TASK_PRIORITIES[priority] };
  }
  if (date <= addCalendarDays(today, URGENCY_WINDOW_DAYS)) return { tone: 'warning', label: date === today ? 'Срок сегодня' : `Срок в ближайшие ${URGENCY_WINDOW_DAYS} дня` };
  return { tone: 'info', label: INSTRUCTION_STATUSES[item.status] ?? INSTRUCTION_STATUSES[INSTRUCTION_STATUS.PENDING] };
}

