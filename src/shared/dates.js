import { DATE_LIMITS, ISO_DATE_PATTERN, LOCAL_MIDDAY_HOUR } from './constants/dates.js';
import { ValidationError } from './errors.js';

const MIN_YEAR = Number(DATE_LIMITS.MIN.slice(0, 4));
const MAX_YEAR = Number(DATE_LIMITS.MAX.slice(0, 4));

export function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function validateDate(value, label = 'Дата') {
  if (!isDate(value)) throw new ValidationError(`${label}: выберите корректную дату.`);
  return value;
}

export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Calendar arithmetic can cross a boundary even when its starting date is valid.
export function boundedLocalDate(date) {
  const year = date.getFullYear();
  if (year < MIN_YEAR) return DATE_LIMITS.MIN;
  if (year > MAX_YEAR) return DATE_LIMITS.MAX;
  return localDate(date);
}

export function formatDate(value) {
  if (!value) return '';
  validateDate(value);
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export function addCalendarDays(value, days) {
  validateDate(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(LOCAL_MIDDAY_HOUR, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return boundedLocalDate(date);
}
