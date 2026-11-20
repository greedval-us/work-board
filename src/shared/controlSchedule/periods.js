import { addCalendarDays, daysInMonth, isDate } from '../dates.js';
import { getControlWeekday } from './recurrence.js';

const MONTHS_PER_PERIOD = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 });

export function controlPeriodForDate(frequency, date) {
  if (!isDate(date)) return undefined;
  if (frequency === 'daily') return { start: date, end: date };
  if (frequency === 'weekly') {
    const offset = getControlWeekday(date) - 1;
    return { start: addCalendarDays(date, -offset), end: addCalendarDays(date, 6 - offset) };
  }
  if (typeof frequency !== 'string' || !Object.hasOwn(MONTHS_PER_PERIOD, frequency)) return undefined;
  const step = MONTHS_PER_PERIOD[frequency];
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  const firstMonth = Math.floor((month - 1) / step) * step + 1;
  const lastMonth = firstMonth + step - 1;
  return {
    start: `${year}-${String(firstMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(lastMonth).padStart(2, '0')}-${daysInMonth(Number(year), lastMonth)}`,
  };
}

export function isControlPeriodOverridden({ frequency, periodDates }, date) {
  const period = periodDates && controlPeriodForDate(frequency, date);
  return Boolean(period && Object.hasOwn(periodDates, period.start));
}
