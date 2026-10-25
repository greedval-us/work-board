import { localDate } from '../../shared/dates.js';
import { LOCAL_MIDDAY_HOUR } from '../../shared/constants/dates.js';
import { CALENDAR_LAYOUT } from '../constants/calendar.js';

const MIDNIGHT_TIMER_GRACE_MS = 50;

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Некорректная календарная дата.');
  return match.slice(1).map((part) => part === undefined ? undefined : Number(part));
}

export function calendarDate(value) {
  const [year, month, day = 1] = dateParts(value);
  const date = new Date(year, month - 1, day, LOCAL_MIDDAY_HOUR);
  date.setFullYear(year);
  return date;
}

export function buildMonthGrid(month) {
  const first = calendarDate(month);
  const offset = (first.getDay() + CALENDAR_LAYOUT.DAYS_PER_WEEK - 1) % CALENDAR_LAYOUT.DAYS_PER_WEEK;
  return Array.from({ length: CALENDAR_LAYOUT.GRID_WEEKS * CALENDAR_LAYOUT.DAYS_PER_WEEK }, (_, index) => {
    const date = new Date(first);
    date.setDate(index - offset + 1);
    const value = localDate(date);
    return { date: value, day: date.getDate(), inMonth: value.slice(0, 7) === month };
  });
}

export function moveMonth(month, delta) {
  const date = calendarDate(month);
  date.setMonth(date.getMonth() + delta);
  return localDate(date).slice(0, 7);
}

export function millisecondsUntilTomorrow(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, MIDNIGHT_TIMER_GRACE_MS);
  return tomorrow.getTime() - now.getTime();
}

export function monthLabel(month) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(calendarDate(month));
}

export function dayLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(calendarDate(date));
}
