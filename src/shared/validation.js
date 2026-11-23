import { ValidationError } from './errors.js';

export function validateRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label}: неверный формат данных.`);
  return value;
}

export function validateText(value, label, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim())) throw new ValidationError(`${label}: укажите текстовое значение.`);
  return value;
}

export function validateEnum(value, choices, label) {
  if (typeof value !== 'string' || !Object.hasOwn(choices, value)) throw new ValidationError(`${label}: выберите значение из списка.`);
  return value;
}

export function validateId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ValidationError('Некорректный идентификатор записи.');
  return id;
}

export function validateDateRange(from, to) {
  if (from && to && from > to) throw new ValidationError('Начало периода не может быть позже окончания.');
}
