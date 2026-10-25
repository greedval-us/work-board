import { ISO_DATE_PATTERN, LOCAL_MIDDAY_HOUR } from './constants/dates.js';
import { ValidationError } from './errors.js';

export function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function validateDate(value, label = 'Дата') {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) throw new ValidationError(`${label}: выберите корректную дату.`);
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new ValidationError(`${label}: выберите корректную дату.`);
  return value;
}

export function localDate(date = new Date()) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  return localDate(date);
}
