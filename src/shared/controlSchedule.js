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
    const { date, text } = validateRecord(value, 'Отметка промежуточного контроля');
    validateDate(date, 'Дата отметки промежуточного контроля');
    if (typeof text !== 'string' || text.length > CONTROL_MARK_LIMIT) {
      throw new ValidationError(`Отметка промежуточного контроля: укажите текст длиной до ${CONTROL_MARK_LIMIT} символов.`);
    }
    if (text.trim()) byDate.set(date, text);
    else byDate.delete(date);
  }
  return [...byDate.keys()].sort().map(date => ({ date, text: byDate.get(date) }));
}

export function validateControlSchedule(value = {}, { controlDate, deadline } = {}) {
  const {
    frequency = '', firstDate = '', customDates = [], marks = [],
  } = validateRecord(value, 'График промежуточного контроля');
  validateEnum(frequency, CONTROL_FREQUENCIES, 'Периодичность промежуточного контроля');
  const recurring = frequency && frequency !== 'custom';
  if (firstDate !== '' || recurring) validateDate(firstDate, 'Первая дата промежуточного контроля');
  if (recurring) checkScheduleBounds(firstDate, controlDate, deadline);
  if (!Array.isArray(customDates)) throw new ValidationError('Даты промежуточного контроля: укажите список дат.');
  for (const date of customDates) {
    validateDate(date, 'Дата промежуточного контроля');
    if (frequency === 'custom') checkScheduleBounds(date, controlDate, deadline);
  }
  if (frequency === 'custom' && !customDates.length) {
    throw new ValidationError('Укажите хотя бы одну дату промежуточного контроля.');
  }
  return {
    frequency,
    firstDate: recurring ? firstDate : '',
    customDates: frequency === 'custom' ? [...new Set(customDates)].sort() : [],
    marks: validateMarks(marks),
  };
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

export function listControlCheckpoints(schedule, { from, to, deadline }) {
  if (!schedule || !isDate(from) || !isDate(to) || from > to) return [];
  const lastScheduledDate = isDate(deadline) && deadline < to ? deadline : to;
  const planned = new Set(scheduledDates(schedule, from, lastScheduledDate));
  const marks = new Map();
  for (const { date, text } of schedule.marks ?? []) {
    if (date >= from && date <= to && isDate(date) && typeof text === 'string' && text.trim()) marks.set(date, text);
  }
  const dates = [...new Set([...planned, ...marks.keys()])].sort();
  return dates.map(date => ({ date, mark: marks.get(date) ?? '', scheduled: planned.has(date) }));
}

export function getNextControlCheckpoint(schedule, deadline) {
  if (!schedule?.frequency || !isDate(deadline)) return '';

  const markedDates = new Set();
  for (const { date, text } of schedule.marks ?? []) {
    if (typeof text === 'string' && text.trim()) markedDates.add(date);
  }

  let next = '';
  for (const date of scheduledDates(schedule, '0001-01-01', deadline)) {
    if (markedDates.has(date)) continue;
    if (schedule.frequency !== 'custom') return date;
    if (!next || date < next) next = date;
  }
  return next;
}
