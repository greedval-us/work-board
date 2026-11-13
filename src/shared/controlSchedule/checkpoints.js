import { isDate, isScheduledDate, scheduledDates } from './recurrence.js';

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
