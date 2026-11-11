import { ValidationError } from '../errors.js';
import { validateEnum, validateText } from '../validation.js';

export const THEMES = Object.freeze(['light', 'dark']);
export const REGISTRY_OPTION_LABELS = Object.freeze({
  source: 'Откуда',
  executor: 'Исполнитель',
  controlType: 'Вид контроля',
});
export const REGISTRY_OPTION_MAX_LENGTH = 300;
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  registryOptions: Object.freeze(Object.fromEntries(
    Object.keys(REGISTRY_OPTION_LABELS).map(field => [field, Object.freeze([])]),
  )),
});

export function validateTheme(theme) {
  if (!THEMES.includes(theme)) throw new ValidationError('Недопустимая тема оформления.');
  return theme;
}

export function validateRegistryOption(field, value) {
  validateEnum(field, REGISTRY_OPTION_LABELS, 'Справочник');
  const label = REGISTRY_OPTION_LABELS[field];
  const option = validateText(value, label, true).trim();
  if (option.length > REGISTRY_OPTION_MAX_LENGTH) {
    throw new ValidationError(`Вариант для поля «${label}» должен содержать не более ${REGISTRY_OPTION_MAX_LENGTH} символов.`);
  }
  return option;
}
