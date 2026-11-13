import { daysInMonth, validateDate } from '../dates.js';

const DAY_STEPS = Object.freeze({ daily: 1, weekly: 7 });
const MONTH_STEPS = Object.freeze({ monthly: 1, quarterly: 3, yearly: 12 });
const DAY_MS = 24 * 60 * 60 * 1000;

export function isDate(value) {
  try { return Boolean(validateDate(value)); }
  catch { return false; }
}

function* dayOccurrences(firstDate, from, to, step) {
  const start = Date.parse(firstDate);
  const end = Date.parse(to);
  const interval = step * DAY_MS;
  const firstOffset = Math.max(0, Math.ceil((Date.parse(from) - start) / interval));
  for (let time = start + firstOffset * interval; time <= end; time += interval) {
    yield new Date(time).toISOString().slice(0, 10);
  }
}

function monthIndex(date) {
  const [year, month] = date.split('-').map(Number);
  return (year - 1) * 12 + month - 1;
}

function* monthOccurrences(firstDate, from, to, step) {
  const start = monthIndex(firstDate);
  const end = monthIndex(to);
  const anchorDay = Number(firstDate.slice(-2));
  const firstOffset = Math.max(0, Math.ceil((monthIndex(from) - start) / step));
  for (let index = start + firstOffset * step; index <= end; index += step) {
    const year = Math.floor(index / 12) + 1;
    const month = index % 12 + 1;
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= from && date <= to) yield date;
  }
}

// Base dates retain their original anchors; moves and completion history are applied by callers.
export function scheduledDates(schedule, from, to) {
  if (from > to) return [];
  const { frequency, firstDate, customDates } = schedule;
  if (frequency === 'custom' && Array.isArray(customDates)) {
    return customDates.filter(date => isDate(date) && date >= from && date <= to);
  }
  if (!isDate(firstDate)) return [];
  if (Object.hasOwn(DAY_STEPS, frequency)) return dayOccurrences(firstDate, from, to, DAY_STEPS[frequency]);
  if (Object.hasOwn(MONTH_STEPS, frequency)) return monthOccurrences(firstDate, from, to, MONTH_STEPS[frequency]);
  return [];
}

export function isScheduledDate(schedule, date, deadline) {
  return isDate(date) && (!isDate(deadline) || date <= deadline)
    && [...scheduledDates(schedule, date, date)].length > 0;
}
