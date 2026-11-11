import { validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateRecord, validateText } from './validation.js';

export const CONTROL_CARD_FIELD_LIMITS = Object.freeze({
  instructionNumber: 200, incomingNumber: 200, source: 500, office: 500, officePhone: 100,
  title: 500, summary: 20_000, executor: 500, department: 500, executorPhone: 100,
  executionMark: 10_000, removalMark: 500,
});

const DATE_LABELS = Object.freeze({
  documentDate: 'Дата документа', incomingDate: 'Дата входящей регистрации',
  deadline: 'Срок исполнения', extendedUntil: 'Продлён до', removalDate: 'Дата снятия с контроля',
});

export function controlCardFields(record) {
  return {
    instructionNumber: record.instructionNumber ?? '', documentDate: '',
    incomingNumber: record.incomingNumber ?? '', incomingDate: '',
    source: record.source ?? '', office: '', officePhone: '',
    title: record.title ?? '', summary: record.summary ?? '',
    deadline: record.deadline ?? '', extendedUntil: record.extendedUntil ?? '',
    executor: record.executor ?? '', department: '', executorPhone: '',
    executionMark: record.executionMark ?? '', removalMark: '', removalDate: '',
  };
}

export function normalizeControlCardFields(fields = {}, defaults = controlCardFields({})) {
  const data = validateRecord(fields, 'Контрольная карточка Ф‑21');
  return Object.fromEntries(Object.entries(defaults).map(([field, saved]) => {
    const value = validateText(Object.hasOwn(data, field) ? data[field] : saved, 'Поле формы Ф‑21').trim();
    if (Object.hasOwn(DATE_LABELS, field)) return [field, value ? validateDate(value, DATE_LABELS[field]) : ''];
    if (value.length > CONTROL_CARD_FIELD_LIMITS[field] && value !== saved.trim()) {
      throw new ValidationError(`Поле формы Ф‑21 должно содержать не более ${CONTROL_CARD_FIELD_LIMITS[field]} символов.`);
    }
    return [field, value];
  }));
}
