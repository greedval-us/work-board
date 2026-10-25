import { emptyAnalyticsFilters } from '../../shared/analytics.js';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { INSTRUCTION_STATUS, localDate } from '../../shared/registry.js';

export const ANALYTICS_PERIODS = Object.freeze({ MONTH: 'month', YEAR: 'year', ALL: 'all' });
const INSTRUCTION_ONLY_STATUSES = new Set([INSTRUCTION_STATUS.PENDING, INSTRUCTION_STATUS.IN_PROGRESS]);

export const supportsTaskFilters = entityType => entityType !== ENTITY_TYPES.INSTRUCTIONS;
export const supportsInstructionFilters = entityType => entityType !== ENTITY_TYPES.TASKS;
export const isAnalyticsStatusAvailable = (entityType, status) => supportsInstructionFilters(entityType) || !INSTRUCTION_ONLY_STATUSES.has(status);
export const showTaskPriorityBreakdown = filters => supportsTaskFilters(filters.entityType) && !filters.executor;

export function changeAnalyticsFilter(filters, key, value) {
  const next = { ...filters, [key]: value };
  if (key === 'entityType') {
    next.priority = '';
    next.executor = '';
  }
  if (key === 'priority' && value) {
    next.entityType = ENTITY_TYPES.TASKS;
    next.executor = '';
  }
  if (key === 'executor' && value) {
    next.entityType = ENTITY_TYPES.INSTRUCTIONS;
    next.priority = '';
  }
  if ((key === 'entityType' || (key === 'priority' && value)) && !isAnalyticsStatusAvailable(next.entityType, next.status)) next.status = '';
  return next;
}

export function applyAnalyticsPeriod(filters, period, today = localDate()) {
  let from = '';
  if (period === ANALYTICS_PERIODS.MONTH) from = `${today.slice(0, 7)}-01`;
  if (period === ANALYTICS_PERIODS.YEAR) from = `${today.slice(0, 4)}-01-01`;
  return { ...filters, from, to: period === ANALYTICS_PERIODS.ALL ? '' : today };
}

export function initialAnalyticsFilters(today = localDate()) {
  return applyAnalyticsPeriod(emptyAnalyticsFilters(), ANALYTICS_PERIODS.MONTH, today);
}
