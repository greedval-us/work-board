import {
  APP_FONT_FAMILIES, APP_FONT_SIZE_LIMITS, CONTROL_CARD_OFFICE_LABEL, CONTROL_CARD_OFFICE_LIMIT,
  REGISTRY_OPTION_LABELS, REGISTRY_OPTION_LIMITS, THEMES,
} from './constants/settings.js';
import { ValidationError } from './errors.js';
import { validateEnum, validateRecord, validateText } from './validation.js';

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
