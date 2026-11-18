import { ValidationError } from '../errors.js';
import { validateEnum, validateRecord, validateText } from '../validation.js';

export const THEMES = Object.freeze(['light', 'dark']);
export const APP_FONT_FAMILIES = Object.freeze({ inter: 'Inter', system: 'Системный' });
export const APP_FONT_SIZE_LIMITS = Object.freeze({ min: 12, max: 16 });
export const INSTRUCTION_OPTION_LABELS = Object.freeze({
  documentType: 'Вид документа',
  source: 'Откуда',
  executor: 'Исполнитель',
});
export const CONTROL_CARD_OPTION_LABELS = Object.freeze({
  department: 'Подразделение',
  executorPhone: 'Телефон исполнителя',
});
export const CONTROL_CARD_OFFICE_LABEL = 'Участок делопроизводства';
export const CONTROL_CARD_OFFICE_LIMIT = 500;
export const REGISTRY_OPTION_LABELS = Object.freeze({
  ...INSTRUCTION_OPTION_LABELS, ...CONTROL_CARD_OPTION_LABELS, office: CONTROL_CARD_OFFICE_LABEL,
});
export const REGISTRY_OPTION_LIMITS = Object.freeze({
  documentType: 300, source: 300, executor: 300, department: 300, executorPhone: 100, office: CONTROL_CARD_OFFICE_LIMIT,
});
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  typography: Object.freeze({ fontFamily: 'inter', fontSize: 14 }),
  registryOptions: Object.freeze(Object.fromEntries(
    Object.keys(REGISTRY_OPTION_LABELS).map(field => [field, Object.freeze([])]),
  )),
  executorContacts: Object.freeze([]),
  office: '',
});

export function validateTheme(theme) {
  if (!THEMES.includes(theme)) throw new ValidationError('Недопустимая тема оформления.');
  return theme;
}

export function validateTypography(value) {
  const { fontFamily, fontSize } = validateRecord(value, 'Настройки шрифта');
  validateEnum(fontFamily, APP_FONT_FAMILIES, 'Шрифт');
  const { min, max } = APP_FONT_SIZE_LIMITS;
  if (!Number.isInteger(fontSize) || fontSize < min || fontSize > max) {
    throw new ValidationError(`Укажите целый размер шрифта от ${min} до ${max} пкс.`);
  }
  return { fontFamily, fontSize };
}

export function validateOffice(value) {
  if (typeof value !== 'string') throw new ValidationError(`${CONTROL_CARD_OFFICE_LABEL}: укажите текстовое значение.`);
  const office = value.trim();
  if (office.length > CONTROL_CARD_OFFICE_LIMIT) {
    throw new ValidationError(`Поле «${CONTROL_CARD_OFFICE_LABEL}» должно содержать не более ${CONTROL_CARD_OFFICE_LIMIT} символов.`);
  }
  return office;
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
