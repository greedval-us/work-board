import { INSTRUCTION_STATUSES, INSTRUCTION_STATUS } from './constants/registry.js';
import { INSTRUCTION_OPTION_LABELS } from './constants/settings.js';
import { validateControlSchedule } from './controlSchedule.js';
import { validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateEnum, validateText } from './validation.js';

export function effectiveDeadline(record) {
  return record.extendedUntil || record.deadline;
}

export function validateControlFields(data, titleLabel) {
  const { extendedUntil = '', status = INSTRUCTION_STATUS.PENDING } = data;
  const fields = {
    controlDate: validateDate(data.controlDate, 'Дата постановки на контроль'),
    incomingNumber: validateText(data.incomingNumber, 'Входящий номер'),
    instructionNumber: validateText(data.instructionNumber, 'Подписной номер', true),
    documentType: validateText(data.documentType, 'Вид документа').trim(),
    source: validateText(data.source, INSTRUCTION_OPTION_LABELS.source),
    title: validateText(data.title, titleLabel, true),
    summary: validateText(data.summary, 'Резолюция'),
    deadline: validateDate(data.deadline, 'Срок исполнения'),
    extendedUntil: extendedUntil === '' ? '' : validateDate(extendedUntil, 'Продлён до'),
    executor: validateText(data.executor, 'Исполнитель', true),
    status: validateEnum(status, INSTRUCTION_STATUSES, 'Статус'),
    executionMark: validateText(data.executionMark, 'Отметка об исполнении'),
  };
  if (fields.extendedUntil && fields.extendedUntil < fields.deadline) {
    throw new ValidationError('Дата продления не может быть раньше срока исполнения.');
  }
  fields.controlSchedule = validateControlSchedule(data.controlSchedule, {
    controlDate: fields.controlDate,
    deadline: effectiveDeadline(fields),
  });
  return fields;
}
