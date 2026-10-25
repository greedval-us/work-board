import { ValidationError } from './errors.js';
import { validateDate, localDate, addCalendarDays } from './dates.js';
import { validateRecord as record, validateText as text, validateEnum as enumValue, validateDateRange } from './validation.js';
import {
  INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES, INSTRUCTION_STATUS, TASK_PRIORITIES,
  TASK_PRIORITY, TASK_PRIORITY_TONES, REGISTRY_PAGINATION, REGISTRY_DEFAULT_SORT, SORT_DIRECTIONS, URGENCY_WINDOW_DAYS,
} from './constants/registry.js';

// Stable domain entry point for existing consumers; concerns live in focused modules.
export * from './constants/registry.js';
export { daysInMonth, validateDate, localDate, formatDate, addCalendarDays } from './dates.js';
export { validateId } from './validation.js';
export { ValidationError } from './errors.js';

export function validateInstruction(value) {
  const data = record(value, 'Указание');
  return {
    controlDate: validateDate(data.controlDate, 'Дата постановки на контроль'),
    incomingNumber: text(data.incomingNumber, 'Входящий номер'),
    instructionNumber: text(data.instructionNumber, 'Номер указания', true),
    title: text(data.title, 'Название указания', true),
    summary: text(data.summary, 'Краткое содержание'),
    deadline: validateDate(data.deadline, 'Срок исполнения'),
    executor: text(data.executor, 'Исполнитель', true),
    status: enumValue(data.status === undefined ? INSTRUCTION_STATUS.PENDING : data.status, INSTRUCTION_STATUSES, 'Статус'),
    executionMark: text(data.executionMark, 'Отметка об исполнении'),
  };
}

export function validateTask(value) {
  const data = record(value, 'Задача');
  const completed = data.completed === undefined ? false : data.completed;
  if (typeof completed !== 'boolean') throw new ValidationError('Выполнение задачи: укажите да или нет.');
  return {
    title: text(data.title, 'Название задачи', true),
    date: validateDate(data.date, 'Дата задачи'),
    description: text(data.description, 'Описание задачи'),
    priority: enumValue(data.priority === undefined ? TASK_PRIORITY.NORMAL : data.priority, TASK_PRIORITIES, 'Срочность'),
    completed,
  };
}

export function emptyFilters() {
  return { instructionNumber: '', deadlineFrom: '', deadlineTo: '', executor: '', status: '', executionMark: '' };
}

export function normalizeFilters(value = {}) {
  const data = record(value, 'Фильтры');
  const filters = emptyFilters();
  for (const key of Object.keys(filters)) filters[key] = text(data[key], 'Фильтр').trim();
  if (filters.deadlineFrom) validateDate(filters.deadlineFrom, 'Срок с');
  if (filters.deadlineTo) validateDate(filters.deadlineTo, 'Срок по');
  validateDateRange(filters.deadlineFrom, filters.deadlineTo);
  if (filters.status) enumValue(filters.status, INSTRUCTION_STATUSES, 'Статус');
  return filters;
}

export function normalizeListRequest(value = {}) {
  const data = record(value, 'Запрос реестра');
  const sort = data.sort === undefined ? {} : record(data.sort, 'Сортировка');
  const field = sort.field === undefined ? REGISTRY_DEFAULT_SORT.field : sort.field;
  const direction = sort.direction === undefined ? REGISTRY_DEFAULT_SORT.direction : sort.direction;
  if (!INSTRUCTION_COLUMNS.some(column => column.key === field) && field !== 'status') {
    throw new ValidationError('Недопустимое поле сортировки.');
  }
  if (!SORT_DIRECTIONS.includes(direction)) throw new ValidationError('Недопустимое направление сортировки.');
  const offset = data.offset === undefined ? REGISTRY_PAGINATION.DEFAULT_OFFSET : data.offset;
  const limit = data.limit === undefined ? REGISTRY_PAGINATION.DEFAULT_SIZE : data.limit;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('Некорректное смещение страницы.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > REGISTRY_PAGINATION.MAX_SIZE) throw new ValidationError(`Размер страницы должен быть от 1 до ${REGISTRY_PAGINATION.MAX_SIZE}.`);
  return { filters: normalizeFilters(data.filters), sort: { field, direction }, offset, limit };
}

export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

export function getUrgency(item, today = localDate()) {
  const isTask = Object.hasOwn(item, 'date');
  if (isTask ? item.completed : item.status === INSTRUCTION_STATUS.COMPLETED) {
    return { tone: 'success', label: isTask ? 'Выполнено' : 'Исполнено' };
  }
  const date = isTask ? item.date : item.deadline;
  if (date < today) return { tone: 'danger', label: 'Просрочено' };
  if (isTask) {
    const priority = item.priority ?? TASK_PRIORITY.NORMAL;
    return { tone: TASK_PRIORITY_TONES[priority], label: TASK_PRIORITIES[priority] };
  }
  if (date <= addCalendarDays(today, URGENCY_WINDOW_DAYS)) return { tone: 'warning', label: date === today ? 'Срок сегодня' : `Срок в ближайшие ${URGENCY_WINDOW_DAYS} дня` };
  return { tone: 'info', label: INSTRUCTION_STATUSES[item.status] ?? 'На контроле' };
}

