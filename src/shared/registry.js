export const INSTRUCTION_COLUMNS = Object.freeze([
  { key: 'controlDate', label: 'Дата постановки на контроль' },
  { key: 'incomingNumber', label: 'Входящий номер' },
  { key: 'instructionNumber', label: 'Номер указания' },
  { key: 'title', label: 'Название указания' },
  { key: 'summary', label: 'Краткое содержание указания' },
  { key: 'deadline', label: 'Сроки исполнения' },
  { key: 'executor', label: 'Исполнитель' },
  { key: 'executionMark', label: 'Отметка об исполнении' },
]);

export const INSTRUCTION_STATUSES = Object.freeze({
  pending: 'На контроле', in_progress: 'В работе', completed: 'Исполнено',
});

export const TASK_PRIORITIES = Object.freeze({
  normal: 'Обычная', important: 'Важная', urgent: 'Срочная',
});

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label}: неверный формат данных.`);
  }
  return value;
}

function text(value, label, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new ValidationError(`${label}: укажите текстовое значение.`);
  }
  return value;
}

export function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function validateDate(value, label = 'Дата') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${label}: выберите корректную дату.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new ValidationError(`${label}: выберите корректную дату.`);
  }
  return value;
}

function enumValue(value, choices, label) {
  if (typeof value !== 'string' || !Object.hasOwn(choices, value)) {
    throw new ValidationError(`${label}: выберите значение из списка.`);
  }
  return value;
}

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
    status: enumValue(data.status === undefined ? 'pending' : data.status, INSTRUCTION_STATUSES, 'Статус'),
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
    priority: enumValue(data.priority === undefined ? 'normal' : data.priority, TASK_PRIORITIES, 'Срочность'),
    completed,
  };
}

export function validateId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError('Некорректный идентификатор записи.');
  return id;
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
  if (filters.deadlineFrom && filters.deadlineTo && filters.deadlineFrom > filters.deadlineTo) {
    throw new ValidationError('Начало периода не может быть позже окончания.');
  }
  if (filters.status) enumValue(filters.status, INSTRUCTION_STATUSES, 'Статус');
  return filters;
}

export function normalizeListRequest(value = {}) {
  const data = record(value, 'Запрос реестра');
  const sort = data.sort === undefined ? {} : record(data.sort, 'Сортировка');
  const field = sort.field === undefined ? 'controlDate' : sort.field;
  const direction = sort.direction === undefined ? 'desc' : sort.direction;
  if (!INSTRUCTION_COLUMNS.some(column => column.key === field) && field !== 'status') {
    throw new ValidationError('Недопустимое поле сортировки.');
  }
  if (!['asc', 'desc'].includes(direction)) throw new ValidationError('Недопустимое направление сортировки.');
  const offset = data.offset === undefined ? 0 : data.offset;
  const limit = data.limit === undefined ? 25 : data.limit;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('Некорректное смещение страницы.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError('Размер страницы должен быть от 1 до 100.');
  return { filters: normalizeFilters(data.filters), sort: { field, direction }, offset, limit };
}

export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDate(value) {
  if (!value) return '';
  validateDate(value);
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function inThreeDays(date) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(0);
  next.setFullYear(year, month - 1, day);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + 3);
  return localDate(next);
}

export function getUrgency(item, today = localDate()) {
  const isTask = Object.hasOwn(item, 'date');
  if (isTask ? item.completed : item.status === 'completed') {
    return { tone: 'success', label: isTask ? 'Выполнено' : 'Исполнено' };
  }
  const date = isTask ? item.date : item.deadline;
  if (date < today) return { tone: 'danger', label: 'Просрочено' };
  if (isTask) {
    const priority = item.priority ?? 'normal';
    return { tone: { normal: 'info', important: 'warning', urgent: 'danger' }[priority], label: TASK_PRIORITIES[priority] };
  }
  if (date <= inThreeDays(today)) return { tone: 'warning', label: date === today ? 'Срок сегодня' : 'Срок в ближайшие 3 дня' };
  return { tone: 'info', label: INSTRUCTION_STATUSES[item.status] ?? 'На контроле' };
}
import { ValidationError } from './errors.js';
export { ValidationError } from './errors.js';

