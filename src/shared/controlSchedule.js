import { daysInMonth, validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateEnum, validateRecord } from './validation.js';

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

const DAY_STEPS = Object.freeze({ daily: 1, weekly: 7 });
const MONTH_STEPS = Object.freeze({ monthly: 1, quarterly: 3, yearly: 12 });
const DAY_MS = 24 * 60 * 60 * 1000;

export function emptyControlSchedule() {
  return { frequency: '', firstDate: '', customDates: [], marks: [] };
}

function checkScheduleBounds(date, controlDate, deadline) {
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

function isDate(value) {
  try { return Boolean(validateDate(value)); }
  catch { return false; }
}

function* dayOccurrences(firstDate, from, to, step) {
  const start = Date.parse(firstDate);
  const end = Date.parse(to);
  const interval = step * DAY_MS;
  const firstOffset = Math.max(0, Math.ceil((Date.parse(from) - start) / interval));
  for (let time = start + firstOffset * interval; time <= end; time += interval) {
    yield new Date(time).toISOString().slice(0, 10);
  }
}

function monthIndex(date) {
  const [year, month] = date.split('-').map(Number);
  return (year - 1) * 12 + month - 1;
}

function* monthOccurrences(firstDate, from, to, step) {
  const start = monthIndex(firstDate);
  const end = monthIndex(to);
  const anchorDay = Number(firstDate.slice(-2));
  const firstOffset = Math.max(0, Math.ceil((monthIndex(from) - start) / step));
  for (let index = start + firstOffset * step; index <= end; index += step) {
    const year = Math.floor(index / 12) + 1;
    const month = index % 12 + 1;
    const day = Math.min(anchorDay, daysInMonth(year, month));
    const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (date >= from && date <= to) yield date;
  }
}

function scheduledDates(schedule, from, to) {
  if (from > to) return [];
  const { frequency, firstDate, customDates } = schedule;
  if (frequency === 'custom' && Array.isArray(customDates)) {
    return customDates.filter(date => isDate(date) && date >= from && date <= to);
  }
  if (!isDate(firstDate)) return [];
  if (Object.hasOwn(DAY_STEPS, frequency)) return dayOccurrences(firstDate, from, to, DAY_STEPS[frequency]);
  if (Object.hasOwn(MONTH_STEPS, frequency)) return monthOccurrences(firstDate, from, to, MONTH_STEPS[frequency]);
  return [];
}

function isScheduledDate(schedule, date, deadline) {
  return isDate(date) && (!isDate(deadline) || date <= deadline)
    && [...scheduledDates(schedule, date, date)].length > 0;
}

function scheduleMoves(schedule) {
  return new Map((schedule.moves ?? []).filter(move => isDate(move.from) && isDate(move.to))
    .map(({ from, to }) => [from, to]));
}

export function listControlCheckpoints(schedule, { from, to, deadline }) {
  if (!schedule || !isDate(from) || !isDate(to) || from > to) return [];
  const lastScheduledDate = isDate(deadline) && deadline < to ? deadline : to;
  const moves = scheduleMoves(schedule);
  const planned = new Map();
  for (const date of scheduledDates(schedule, from, lastScheduledDate)) {
    if (!moves.has(date)) planned.set(date, '');
  }
  for (const [originalDate, date] of moves) {
    if (date >= from && date <= lastScheduledDate && isScheduledDate(schedule, originalDate, deadline)) {
      planned.set(date, originalDate);
    }
  }
  const marks = new Map();
  for (const mark of schedule.marks ?? []) {
    const { date, text } = mark;
    if (date >= from && date <= to && isDate(date) && typeof text === 'string' && text.trim()) marks.set(date, mark);
  }
  const dates = [...new Set([...planned.keys(), ...marks.keys()])].sort();
  return dates.map(date => ({
    date, mark: marks.get(date)?.text ?? '', scheduled: planned.has(date),
    ...(planned.get(date) ? { originalDate: planned.get(date) } : {}),
    ...(marks.get(date)?.actualDate ? { actualDate: marks.get(date).actualDate } : {}),
  }));
}

export function getNextControlCheckpoint(schedule, deadline) {
  if (!schedule?.frequency || !isDate(deadline)) return '';

  const markedDates = new Set();
  for (const { date, text } of schedule.marks ?? []) {
    if (typeof text === 'string' && text.trim()) markedDates.add(date);
  }

  const moves = scheduleMoves(schedule);
  let next = '';
  for (const [originalDate, date] of moves) {
    if (date <= deadline && !markedDates.has(date) && isScheduledDate(schedule, originalDate, deadline)
      && (!next || date < next)) next = date;
  }
  for (const date of scheduledDates(schedule, '0001-01-01', deadline)) {
    if (markedDates.has(date) || moves.has(date)) continue;
    if (schedule.frequency !== 'custom') return next && next < date ? next : date;
    if (!next || date < next) next = date;
  }
  return next;
}

export function moveControlCheckpoint(value, from, to, bounds = {}) {
  // Existing overrides may need correction after the control period changes.
  // Validate the selected destination now; validate every draft date on save.
  const schedule = validateControlSchedule(value);
  validateDate(from, 'Исходная дата промежуточного контроля');
  validateDate(to, 'Новая дата промежуточного контроля');
  checkScheduleBounds(to, bounds.controlDate, bounds.deadline);
  const checkpoint = listControlCheckpoints(schedule, { from, to: from })
    .find(row => row.scheduled);
  if (!checkpoint) throw new ValidationError('Исходная дата отсутствует в действующем графике промежуточного контроля.');
  if (from === to) return schedule;
  if (listControlCheckpoints(schedule, { from: to, to }).length) {
    throw new ValidationError('На выбранную дату уже назначен промежуточный контроль или сохранена отметка.');
  }
  const originalDate = checkpoint.originalDate ?? from;
  const moves = (schedule.moves ?? []).filter(move => move.from !== originalDate);
  if (originalDate !== to) moves.push({ from: originalDate, to });
  const marks = schedule.marks.map(mark => mark.date === from
    ? { ...mark, date: to, actualDate: mark.actualDate ?? from } : mark);
  return validateControlSchedule({ ...schedule, moves, marks });
}
