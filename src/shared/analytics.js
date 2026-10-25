import { TASK_PRIORITIES, validateDate, ValidationError } from './registry.js';
import { ENTITY_TYPES } from './constants/entities.js';
import { validateDateRange } from './validation.js';

export const ANALYTICS_STATUSES = Object.freeze({ active: 'Все активные', pending: 'На контроле', in_progress: 'В работе', completed: 'Выполнено' });
export function emptyAnalyticsFilters() { return { from: '', to: '', entityType: '', status: '', priority: '', executor: '' }; }
export function normalizeAnalyticsFilters(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Некорректные фильтры аналитики.');
  const filters = emptyAnalyticsFilters();
  for (const key of Object.keys(filters)) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new ValidationError('Некорректные фильтры аналитики.');
    filters[key] = (value[key] ?? '').trim();
  }
  if (filters.from) validateDate(filters.from, 'Начало периода');
  if (filters.to) validateDate(filters.to, 'Конец периода');
  validateDateRange(filters.from, filters.to);
  if (filters.entityType && !Object.values(ENTITY_TYPES).includes(filters.entityType)) throw new ValidationError('Выберите тип записи.');
  if (filters.status && !Object.hasOwn(ANALYTICS_STATUSES, filters.status)) throw new ValidationError('Выберите корректный статус.');
  if (filters.priority && !Object.hasOwn(TASK_PRIORITIES, filters.priority)) throw new ValidationError('Выберите важность из списка.');
  return filters;
}
