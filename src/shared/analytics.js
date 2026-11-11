import { INSTRUCTION_STATUSES } from './constants/registry.js';
import { validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateDateRange } from './validation.js';

export const ANALYTICS_STATUSES = Object.freeze({ active: 'Все активные', ...INSTRUCTION_STATUSES });
export function emptyAnalyticsFilters() { return { from: '', to: '', status: '', executor: '' }; }
export function normalizeAnalyticsFilters(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Некорректные фильтры аналитики.');
  const filters = emptyAnalyticsFilters();
  for (const key of Object.keys(filters)) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new ValidationError('Некорректные фильтры аналитики.');
    const filter = value[key] ?? '';
    // The executor is the exact key returned by the selector's data source.
    filters[key] = key === 'executor' ? filter : filter.trim();
  }
  if (filters.from) validateDate(filters.from, 'Начало периода');
  if (filters.to) validateDate(filters.to, 'Конец периода');
  validateDateRange(filters.from, filters.to);
  if (filters.status && !Object.hasOwn(ANALYTICS_STATUSES, filters.status)) throw new ValidationError('Выберите корректный статус.');
  return filters;
}
