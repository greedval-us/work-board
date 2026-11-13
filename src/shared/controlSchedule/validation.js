import { validateDate } from '../dates.js';
import { ValidationError } from '../errors.js';
import { validateEnum, validateRecord } from '../validation.js';
import { isScheduledDate } from './recurrence.js';

export const CONTROL_FREQUENCIES = Object.freeze({
  '': 'Без промежуточного контроля',
  daily: 'Ежедневно',
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  yearly: 'Ежегодно',
  custom: 'Другое (даты вручную)',
});

export const CONTROL_MARK_LIMIT = 10_000;

export function emptyControlSchedule() {
  return { frequency: '', firstDate: '', customDates: [], marks: [] };
}

export function checkScheduleBounds(date, controlDate, deadline) {
  if (controlDate && date < controlDate) {
    throw new ValidationError('Дата промежуточного контроля не может быть раньше даты постановки на контроль.');
  }
  if (deadline && date > deadline) {
    throw new ValidationError('Дата промежуточного контроля не может быть позже срока исполнения.');
  }
}

function validateMarks(values) {
  if (!Array.isArray(values)) throw new ValidationError('Отметки промежуточного контроля: укажите список отметок.');
  const byDate = new Map();
  for (const value of values) {
    const { date, text, actualDate } = validateRecord(value, 'Отметка промежуточного контроля');
    validateDate(date, 'Дата отметки промежуточного контроля');
    if (actualDate !== undefined) validateDate(actualDate, 'Фактическая дата исполнения');
    if (typeof text !== 'string' || text.length > CONTROL_MARK_LIMIT) {
      throw new ValidationError(`Отметка промежуточного контроля: укажите текст длиной до ${CONTROL_MARK_LIMIT} символов.`);
    }
    if (text.trim()) byDate.set(date, { date, text, ...(actualDate ? { actualDate } : {}) });
    else byDate.delete(date);
  }
  return [...byDate.keys()].sort().map(date => byDate.get(date));
}

function validateMoves(values, schedule, { controlDate, deadline }) {
  if (!Array.isArray(values)) throw new ValidationError('Переносы промежуточного контроля: укажите список переносов.');
  const byOrigin = new Map();
  const destinations = new Set();
  const markedDates = new Set(schedule.marks.map(mark => mark.date));
  for (const value of values) {
    const { from, to } = validateRecord(value, 'Перенос промежуточного контроля');
    validateDate(from, 'Исходная дата промежуточного контроля');
    validateDate(to, 'Новая дата промежуточного контроля');
    if (!isScheduledDate(schedule, from)) throw new ValidationError('Исходная дата отсутствует в графике промежуточного контроля.');
    if (byOrigin.has(from) || destinations.has(to)) throw new ValidationError('Переносы промежуточного контроля не могут повторять даты.');
    // Completed history remains readable when the instruction's deadline is shortened.
    if (!markedDates.has(to)) checkScheduleBounds(to, controlDate, deadline);
    byOrigin.set(from, to);
    destinations.add(to);
  }
  for (const [from, to] of byOrigin) {
    if (from !== to && isScheduledDate(schedule, to) && !byOrigin.has(to)) {
      throw new ValidationError('На выбранную дату уже назначен промежуточный контроль.');
    }
  }
  return [...byOrigin].filter(([from, to]) => from !== to)
    .sort(([left], [right]) => left.localeCompare(right)).map(([from, to]) => ({ from, to }));
}

export function validateControlSchedule(value = {}, { controlDate, deadline } = {}) {
  const {
    frequency = '', firstDate = '', customDates = [], marks = [], moves = [],
  } = validateRecord(value, 'График промежуточного контроля');
  validateEnum(frequency, CONTROL_FREQUENCIES, 'Периодичность промежуточного контроля');
  const recurring = frequency && frequency !== 'custom';
  if (firstDate !== '' || recurring) validateDate(firstDate, 'Первая дата промежуточного контроля');
  if (recurring) checkScheduleBounds(firstDate, controlDate, deadline);
  if (!Array.isArray(customDates)) throw new ValidationError('Даты промежуточного контроля: укажите список дат.');
  for (const date of customDates) {
    validateDate(date, 'Дата промежуточного контроля');
  }
  if (frequency === 'custom' && !customDates.length) {
    throw new ValidationError('Укажите хотя бы одну дату промежуточного контроля.');
  }
  const schedule = {
    frequency,
    firstDate: recurring ? firstDate : '',
    customDates: frequency === 'custom' ? [...new Set(customDates)].sort() : [],
    marks: validateMarks(marks),
  };
  const normalizedMoves = validateMoves(moves, schedule, { controlDate, deadline });
  if (normalizedMoves.length) schedule.moves = normalizedMoves;
  const movedOrigins = new Set(normalizedMoves.map(move => move.from));
  for (const date of schedule.customDates) {
    if (!movedOrigins.has(date)) checkScheduleBounds(date, controlDate, deadline);
  }
  return schedule;
}
