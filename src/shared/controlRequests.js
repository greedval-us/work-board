import {
  CHECKPOINT_FILTER_LABELS, INSTRUCTION_STATUSES, REGISTRY_DEFAULT_SORT,
  REGISTRY_PAGINATION, REGISTRY_REPORT_TYPE, SORT_DIRECTIONS,
} from './constants/registry.js';
import { validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateDateRange, validateEnum as enumValue, validateRecord as record, validateText as text } from './validation.js';

export function emptyFilters() {
  return { instructionNumber: '', deadlineFrom: '', deadlineTo: '', executor: '', documentType: '', status: '', executionMark: '', checkpoint: '' };
}

export function normalizeFilters(value = {}) {
  const data = record(value, 'Фильтры');
  const filters = emptyFilters();
  for (const key of Object.keys(filters)) filters[key] = text(data[key], 'Фильтр').trim();
  if (filters.deadlineFrom) validateDate(filters.deadlineFrom, 'Срок с');
  if (filters.deadlineTo) validateDate(filters.deadlineTo, 'Срок по');
  validateDateRange(filters.deadlineFrom, filters.deadlineTo);
  if (filters.status) enumValue(filters.status, INSTRUCTION_STATUSES, 'Статус');
  if (filters.checkpoint) enumValue(filters.checkpoint, CHECKPOINT_FILTER_LABELS, 'Промежуточный контроль');
  return filters;
}

export function normalizeControlListRequest(value, columns) {
  const data = record(value, 'Запрос списка');
  const sort = data.sort === undefined ? {} : record(data.sort, 'Сортировка');
  const field = sort.field === undefined ? REGISTRY_DEFAULT_SORT.field : sort.field;
  const direction = sort.direction === undefined ? REGISTRY_DEFAULT_SORT.direction : sort.direction;
  if (!columns.some(column => column.key === field) && field !== 'status') {
    throw new ValidationError('Недопустимое поле сортировки.');
  }
  if (!SORT_DIRECTIONS.includes(direction)) throw new ValidationError('Недопустимое направление сортировки.');
  const offset = data.offset === undefined ? REGISTRY_PAGINATION.DEFAULT_OFFSET : data.offset;
  const limit = data.limit === undefined ? REGISTRY_PAGINATION.DEFAULT_SIZE : data.limit;
  const { closed = false } = data;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('Некорректное смещение страницы.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > REGISTRY_PAGINATION.MAX_SIZE) throw new ValidationError(`Размер страницы должен быть от 1 до ${REGISTRY_PAGINATION.MAX_SIZE}.`);
  if (typeof closed !== 'boolean') throw new ValidationError('Некорректный раздел контроля.');
  const request = { filters: normalizeFilters(data.filters), sort: { field, direction }, offset, limit, closed };
  if (data.today !== undefined) request.today = validateDate(data.today);
  return request;
}

export function normalizeControlExportRequest(value, columns) {
  const { reportType = REGISTRY_REPORT_TYPE.FULL } = record(value, 'Запрос выгрузки');
  if (!Object.values(REGISTRY_REPORT_TYPE).includes(reportType)) {
    throw new ValidationError('Недопустимый вид отчёта Excel.');
  }
  // The overdue report covers the entire section, independently of its current list.
  const list = reportType === REGISTRY_REPORT_TYPE.OVERDUE ? {} : value;
  return { ...normalizeControlListRequest(list, columns), reportType };
}
