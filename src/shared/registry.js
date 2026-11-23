import { ValidationError } from './errors.js';
import { validateDate, localDate, addCalendarDays } from './dates.js';
import { validateRecord as record, validateText as text, validateEnum as enumValue } from './validation.js';
import { validateControlSchedule } from './controlSchedule.js';
import { validateTaskRecurrence } from './taskRecurrence.js';
import { INSTRUCTION_OPTION_LABELS } from './constants/settings.js';
import {
  INSTRUCTION_STATUSES, INSTRUCTION_STATUS, TASK_PRIORITIES, TASK_PRIORITY, TASK_PRIORITY_TONES, URGENCY_WINDOW_DAYS,
} from './constants/registry.js';

// Stable domain entry point for existing consumers; concerns live in focused modules.
export * from './constants/registry.js';
export { emptyFilters, normalizeExportRequest, normalizeFilters, normalizeListRequest } from './registryRequests.js';
export { daysInMonth, validateDate, localDate, formatDate, addCalendarDays } from './dates.js';
export { validateId } from './validation.js';
export { ValidationError } from './errors.js';

export function validateInstruction(value) {
  const data = record(value, 'Указание');
  const { extendedUntil = '' } = data;
  const instruction = {
    controlDate: validateDate(data.controlDate, 'Дата постановки на контроль'),
    incomingNumber: text(data.incomingNumber, 'Входящий номер'),
    instructionNumber: text(data.instructionNumber, 'Подписной номер', true),
    documentType: text(data.documentType, 'Вид документа').trim(),
    source: text(data.source, INSTRUCTION_OPTION_LABELS.source),
    title: text(data.title, 'Название указания', true),
    summary: text(data.summary, 'Резолюция'),
    deadline: validateDate(data.deadline, 'Срок исполнения'),
    extendedUntil: extendedUntil === '' ? '' : validateDate(extendedUntil, 'Продлён до'),
    executor: text(data.executor, 'Исполнитель', true),
    status: enumValue(data.status === undefined ? INSTRUCTION_STATUS.PENDING : data.status, INSTRUCTION_STATUSES, 'Статус'),
    executionMark: text(data.executionMark, 'Отметка об исполнении'),
  };
  if (instruction.extendedUntil && instruction.extendedUntil < instruction.deadline) {
    throw new ValidationError('Дата продления не может быть раньше срока исполнения.');
  }
  instruction.controlSchedule = validateControlSchedule(data.controlSchedule, {
    controlDate: instruction.controlDate,
    deadline: instructionDeadline(instruction),
  });
  return instruction;
}

export function validateTask(value) {
  const data = record(value, 'Задача');
  const completed = data.completed === undefined ? false : data.completed;
  if (typeof completed !== 'boolean') throw new ValidationError('Выполнение задачи: укажите да или нет.');
  const date = validateDate(data.date, 'Дата задачи');
  const recurrence = validateTaskRecurrence(data.recurrence, date);
  return {
    title: text(data.title, 'Название задачи', true),
    date,
    description: text(data.description, 'Описание задачи'),
    priority: enumValue(data.priority === undefined ? TASK_PRIORITY.NORMAL : data.priority, TASK_PRIORITIES, 'Срочность'),
    completed,
    ...(recurrence ? { recurrence } : {}),
  };
}

export function normalizeSearch(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

export function instructionDeadline(item) {
  return item.extendedUntil || item.deadline;
}

export function getUrgency(item, today = localDate()) {
  const isTask = Object.hasOwn(item, 'date');
  if (isTask ? item.completed : item.status === INSTRUCTION_STATUS.COMPLETED) {
    return { tone: 'success', label: isTask ? 'Выполнено' : INSTRUCTION_STATUSES[INSTRUCTION_STATUS.COMPLETED] };
  }
  const date = isTask ? item.date : instructionDeadline(item);
  if (date < today) return { tone: 'danger', label: 'Просрочено' };
  if (isTask) {
    const priority = item.priority ?? TASK_PRIORITY.NORMAL;
    return { tone: TASK_PRIORITY_TONES[priority], label: TASK_PRIORITIES[priority] };
  }
  if (date <= addCalendarDays(today, URGENCY_WINDOW_DAYS)) return { tone: 'warning', label: date === today ? 'Срок сегодня' : `Срок в ближайшие ${URGENCY_WINDOW_DAYS} дня` };
  return { tone: 'info', label: INSTRUCTION_STATUSES[item.status] ?? INSTRUCTION_STATUSES[INSTRUCTION_STATUS.PENDING] };
}

