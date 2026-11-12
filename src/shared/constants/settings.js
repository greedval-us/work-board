import { ValidationError } from '../errors.js';
import { validateEnum, validateText } from '../validation.js';

export const THEMES = Object.freeze(['light', 'dark']);
export const INSTRUCTION_OPTION_LABELS = Object.freeze({
  source: 'Откуда',
  executor: 'Исполнитель',
});
export const CONTROL_CARD_OPTION_LABELS = Object.freeze({
  department: 'Подразделение',
  executorPhone: 'Телефон исполнителя',
});
export const REGISTRY_OPTION_LABELS = Object.freeze({ ...INSTRUCTION_OPTION_LABELS, ...CONTROL_CARD_OPTION_LABELS });
export const REGISTRY_OPTION_LIMITS = Object.freeze({ source: 300, executor: 300, department: 300, executorPhone: 100 });
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  registryOptions: Object.freeze(Object.fromEntries(
    Object.keys(REGISTRY_OPTION_LABELS).map(field => [field, Object.freeze([])]),
  )),
  executorContacts: Object.freeze([]),
});

export function validateTheme(theme) {
  if (!THEMES.includes(theme)) throw new ValidationError('Недопустимая тема оформления.');
  return theme;
}

export function validateRegistryOption(field, value) {
  validateEnum(field, REGISTRY_OPTION_LABELS, 'Справочник');
  const label = REGISTRY_OPTION_LABELS[field];
  const limit = REGISTRY_OPTION_LIMITS[field];
  const option = validateText(value, label, true).trim();
  if (option.length > limit) {
    throw new ValidationError(`Вариант для поля «${label}» должен содержать не более ${limit} символов.`);
  }
  return option;
}
