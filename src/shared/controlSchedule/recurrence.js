import { daysInMonth, isDate } from '../dates.js';

const DAYS_IN_WEEK = 7;
const MONTHS_IN_YEAR = 12;
const DAY_STEPS = Object.freeze({ daily: 1, weekly: DAYS_IN_WEEK });
const MONTH_STEPS = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6, yearly: MONTHS_IN_YEAR });
const DAY_MS = 24 * 60 * 60 * 1000;

export function supportsControlDayOfMonth(frequency) {
  return typeof frequency === 'string' && Object.hasOwn(MONTH_STEPS, frequency);
}

export function isValidControlDayOfMonth(value) {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

export function isValidControlDayOfWeek(value) {
  return Number.isInteger(value) && value >= 1 && value <= DAYS_IN_WEEK;
}

export function isValidControlMonthOfYear(value) {
  return Number.isInteger(value) && value >= 1 && value <= MONTHS_IN_YEAR;
}

export function getControlWeekday(date) {
  if (!isDate(date)) return null;
  return new Date(date).getUTCDay() || DAYS_IN_WEEK;
}

function* dayOccurrences(firstDate, from, to, step, dayOfWeek) {
  let start = Date.parse(firstDate);
  if (isValidControlDayOfWeek(dayOfWeek)) {
    const firstWeekday = getControlWeekday(firstDate);
    const daysUntilMatch = (dayOfWeek - firstWeekday + DAYS_IN_WEEK) % DAYS_IN_WEEK;
    start += daysUntilMatch * DAY_MS;
  }
  const end = Date.parse(to);
  const interval = step * DAY_MS;
  const firstOffset = Math.max(0, Math.ceil((Date.parse(from) - start) / interval));
  for (let time = start + firstOffset * interval; time <= end; time += interval) {
    yield new Date(time).toISOString().slice(0, 10);
  }
}

function monthIndex(date, monthOverride) {
  const [year, month] = date.split('-').map(Number);
  return (year - 1) * MONTHS_IN_YEAR + (monthOverride ?? month) - 1;
}

function* monthOccurrences(firstDate, from, to, step, dayOfMonth, monthOfYear) {
  const start = monthIndex(firstDate, monthOfYear);
  const end = monthIndex(to);
  // The anchor month sets the cycle even if its selected day is before the start.
  const lowerBound = from < firstDate ? firstDate : from;
  const anchorDay = isValidControlDayOfMonth(dayOfMonth) ? dayOfMonth : Number(firstDate.slice(-2));
  const firstOffset = Math.ceil((monthIndex(lowerBound) - start) / step);
  for (let index = start + firstOffset * step; index <= end; index += step) {
    const year = Math.floor(index / MONTHS_IN_YEAR) + 1;
    const month = index % MONTHS_IN_YEAR + 1;
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= lowerBound && date <= to) yield date;
  }
}

function recurringDates({ frequency, firstDate, dayOfMonth, dayOfWeek, monthOfYear }, from, to) {
  if (!isDate(firstDate)) return [];
  if (Object.hasOwn(DAY_STEPS, frequency)) {
    return dayOccurrences(firstDate, from, to, DAY_STEPS[frequency], frequency === 'weekly' ? dayOfWeek : undefined);
  }
  if (supportsControlDayOfMonth(frequency)) {
    const month = frequency === 'yearly' && isValidControlMonthOfYear(monthOfYear) ? monthOfYear : undefined;
    return monthOccurrences(firstDate, from, to, MONTH_STEPS[frequency], dayOfMonth, month);
  }
  return [];
}

// Merge manual and automatic dates in order without materializing the recurrence.
export function* scheduledDates(schedule, from, to) {
  if (from > to || !schedule.frequency) return;
  const { customDates } = schedule;
  const manualDates = Array.isArray(customDates)
    ? [...new Set(customDates.filter(date => isDate(date) && date >= from && date <= to))].sort() : [];
  let manualIndex = 0;
  for (const date of recurringDates(schedule, from, to)) {
    while (manualIndex < manualDates.length && manualDates[manualIndex] < date) {
      yield manualDates[manualIndex];
      manualIndex += 1;
    }
    if (manualDates[manualIndex] === date) manualIndex += 1;
    yield date;
  }
  yield* manualDates.slice(manualIndex);
}

export function isScheduledDate(schedule, date, deadline) {
  return isDate(date) && (!isDate(deadline) || date <= deadline)
    && !scheduledDates(schedule, date, date).next().done;
}
