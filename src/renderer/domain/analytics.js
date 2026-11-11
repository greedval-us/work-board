import { emptyAnalyticsFilters } from '../../shared/analytics.js';
import { localDate, normalizeSearch } from '../../shared/registry.js';

export const ANALYTICS_PERIODS = Object.freeze({ MONTH: 'month', YEAR: 'year', ALL: 'all' });

export function analyticsExecutorOptions(recorded, configured, selected) {
  const options = new Map(recorded.map(({ key, label }) => [key, label]));
  for (const label of configured) options.set(normalizeSearch(label), label);
  if (selected && !options.has(selected)) options.set(selected, selected);
  return [...options].map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ru-RU'));
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
