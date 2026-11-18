import { validateDate } from '../dates.js';
import { ValidationError } from '../errors.js';
import { validateEnum, validateRecord } from '../validation.js';
import {
  isScheduledDate, isValidControlDayOfMonth, isValidControlDayOfWeek, isValidControlMonthOfYear, supportsControlDayOfMonth,
} from './recurrence.js';

export const CONTROL_FREQUENCIES = Object.freeze({
  '': 'Без промежуточного контроля',
  daily: 'Ежедневно',
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  semiannual: 'Полугодие',
  yearly: 'Ежегодно',
  custom: 'Другое (даты вручную)',
});

export const CONTROL_WEEKDAY_LABELS = Object.freeze({
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
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

// Moved checkpoints use their destination. Completed moves remain as history when the period changes.
export function controlDatesRequiringBounds({ frequency, customDates = [], moves = [], marks = [] }) {
  const markedDates = new Set(marks.filter(mark => mark.text.trim()).map(mark => mark.date));
  const movedOrigins = new Set();
  const dates = [];
  for (const { from, to } of moves) {
    if (from !== to) movedOrigins.add(from);
    if (!markedDates.has(to)) dates.push(to);
  }
  if (frequency === 'custom') {
    for (const date of customDates) {
      if (!movedOrigins.has(date)) dates.push(date);
    }
  }
  return dates;
}

function validateMoves(values, schedule) {
  if (!Array.isArray(values)) throw new ValidationError('Переносы промежуточного контроля: укажите список переносов.');
  const byOrigin = new Map();
  const destinations = new Set();
  for (const value of values) {
    const { from, to } = validateRecord(value, 'Перенос промежуточного контроля');
    validateDate(from, 'Исходная дата промежуточного контроля');
    validateDate(to, 'Новая дата промежуточного контроля');
    if (!isScheduledDate(schedule, from)) throw new ValidationError('Исходная дата отсутствует в графике промежуточного контроля.');
    if (byOrigin.has(from) || destinations.has(to)) throw new ValidationError('Переносы промежуточного контроля не могут повторять даты.');
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
    frequency = '', firstDate = '', customDates = [], marks = [], moves = [], dayOfMonth, dayOfWeek, monthOfYear,
  } = validateRecord(value, 'График промежуточного контроля');
  validateEnum(frequency, CONTROL_FREQUENCIES, 'Периодичность промежуточного контроля');
  if (dayOfMonth !== undefined) {
    if (!supportsControlDayOfMonth(frequency)) {
      throw new ValidationError('Число месяца нельзя указать для выбранной периодичности.');
    }
    if (!isValidControlDayOfMonth(dayOfMonth)) {
      throw new ValidationError('Число месяца: укажите целое число от 1 до 31.');
    }
  }
  if (dayOfWeek !== undefined) {
    if (frequency !== 'weekly') throw new ValidationError('День недели можно указать только для еженедельного контроля.');
    if (!isValidControlDayOfWeek(dayOfWeek)) throw new ValidationError('День недели: выберите день от понедельника до воскресенья.');
  }
  if (monthOfYear !== undefined) {
    if (frequency !== 'yearly') throw new ValidationError('Месяц можно указать только для ежегодного контроля.');
    if (!isValidControlMonthOfYear(monthOfYear)) throw new ValidationError('Месяц: выберите месяц от января до декабря.');
  }
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
    ...(dayOfMonth === undefined ? {} : { dayOfMonth }),
    ...(dayOfWeek === undefined ? {} : { dayOfWeek }),
    ...(monthOfYear === undefined ? {} : { monthOfYear }),
  };
  const normalizedMoves = validateMoves(moves, schedule);
  for (const date of controlDatesRequiringBounds({ ...schedule, moves })) checkScheduleBounds(date, controlDate, deadline);
  if (normalizedMoves.length) schedule.moves = normalizedMoves;
  return schedule;
}
