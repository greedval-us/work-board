import { DATE_LIMITS } from '../constants/dates.js';
import { addCalendarDays, isDate } from '../dates.js';
import { isControlPeriodOverridden } from './periods.js';
import { isScheduledDate, scheduledDates } from './recurrence.js';

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
    if (!moves.has(date) && !isControlPeriodOverridden(schedule, date)) planned.set(date, '');
  }
  for (const [originalDate, date] of moves) {
    if (date >= from && date <= lastScheduledDate && !isControlPeriodOverridden(schedule, date)
      && isScheduledDate(schedule, originalDate, deadline)) {
      planned.set(date, originalDate);
    }
  }
  for (const date of Object.values(schedule.periodDates ?? {})) {
    if (isDate(date) && date >= from && date <= lastScheduledDate) planned.set(date, '');
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

// Enumerate long-running automatic schedules a year at a time, keeping the
// temporary maps of dates bounded while preserving moves and marked history.
export function* iterateControlCheckpoints(schedule, { from, to, deadline }) {
  if (!schedule?.frequency || schedule.frequency === 'custom' || !isDate(schedule.firstDate)) {
    yield* listControlCheckpoints(schedule, { from, to, deadline });
    return;
  }
  const marks = schedule.marks ?? [];
  const start = [schedule.firstDate, ...(schedule.customDates ?? []), ...Object.values(schedule.periodDates ?? {}),
    ...(schedule.moves ?? []).map(move => move.to), ...marks.map(mark => mark.date)]
    .reduce((earliest, date) => isDate(date) && date < earliest ? date : earliest, schedule.firstDate);
  const end = marks.reduce((latest, mark) => isDate(mark.date) && mark.date > latest ? mark.date : latest, deadline);
  const limit = end < to ? end : to;
  let cursor = from > start ? from : start;
  while (cursor <= limit) {
    const yearEnd = `${cursor.slice(0, 4)}-12-31`;
    const through = yearEnd < limit ? yearEnd : limit;
    yield* listControlCheckpoints(schedule, { from: cursor, to: through, deadline });
    if (through === limit) break;
    cursor = addCalendarDays(through, 1);
  }
}

export function getNextControlCheckpoint(schedule, deadline) {
  if (!schedule?.frequency || !isDate(deadline)) return '';

  const markedDates = new Set();
  for (const { date, text } of schedule.marks ?? []) {
    if (typeof text === 'string' && text.trim()) markedDates.add(date);
  }

  const moves = scheduleMoves(schedule);
  let next = '';
  for (const date of Object.values(schedule.periodDates ?? {})) {
    if (isDate(date) && date <= deadline && !markedDates.has(date) && (!next || date < next)) next = date;
  }
  for (const [originalDate, date] of moves) {
    if (date <= deadline && !markedDates.has(date) && !isControlPeriodOverridden(schedule, date)
      && isScheduledDate(schedule, originalDate, deadline)
      && (!next || date < next)) next = date;
  }
  for (const date of scheduledDates(schedule, DATE_LIMITS.MIN, deadline)) {
    if (next && next <= date) return next;
    if (!markedDates.has(date) && !moves.has(date) && !isControlPeriodOverridden(schedule, date)) return date;
  }
  return next;
}
