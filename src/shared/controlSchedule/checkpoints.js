import { DATE_LIMITS } from '../constants/dates.js';
import { isDate } from '../dates.js';
import { isControlPeriodOverridden } from './periods.js';
import { isScheduledDate, scheduledDates } from './recurrence.js';

function scheduleMoves(schedule) {
  return new Map((schedule.moves ?? []).filter(move => isDate(move.from) && isDate(move.to))
    .map(({ from, to }) => [from, to]));
}

function changedPlan(schedule, moves, from, to, deadline) {
  const changed = new Map();
  for (const [originalDate, date] of moves) {
    if (date >= from && date <= to && !isControlPeriodOverridden(schedule, date)
      && isScheduledDate(schedule, originalDate, deadline)) {
      changed.set(date, originalDate);
    }
  }
  for (const date of Object.values(schedule.periodDates ?? {})) {
    if (isDate(date) && date >= from && date <= to) changed.set(date, '');
  }
  return changed;
}

export function* iterateControlCheckpoints(schedule, { from, to, deadline }) {
  if (!schedule || !isDate(from) || !isDate(to) || from > to) return;
  const lastScheduledDate = isDate(deadline) && deadline < to ? deadline : to;
  const moves = scheduleMoves(schedule);
  const changed = changedPlan(schedule, moves, from, lastScheduledDate, deadline);
  const marks = new Map();
  for (const mark of schedule.marks ?? []) {
    const { date, text } = mark;
    if (date >= from && date <= to && isDate(date) && typeof text === 'string' && text.trim()) marks.set(date, mark);
  }

  // Merge saved dates with the recurrence, advancing each source only as rows are consumed.
  const savedDates = [...new Set([...changed.keys(), ...marks.keys()])].sort();
  const baseDates = scheduledDates(schedule, from, lastScheduledDate);
  let baseDate = baseDates.next().value;
  let index = 0;
  while (baseDate || index < savedDates.length) {
    const savedDate = savedDates[index];
    const date = savedDate && (!baseDate || savedDate < baseDate) ? savedDate : baseDate;
    const originalDate = changed.get(date);
    const scheduled = changed.has(date)
      || (date === baseDate && !moves.has(date) && !isControlPeriodOverridden(schedule, date));
    const mark = marks.get(date);
    if (scheduled || mark) {
      yield {
        date, mark: mark?.text ?? '', scheduled,
        ...(originalDate ? { originalDate } : {}),
        ...(mark?.actualDate ? { actualDate: mark.actualDate } : {}),
      };
    }
    if (date === baseDate) baseDate = baseDates.next().value;
    if (date === savedDate) index += 1;
  }
}

export function listControlCheckpoints(schedule, bounds) {
  return [...iterateControlCheckpoints(schedule, bounds)];
}

export function getNextControlCheckpoint(schedule, deadline) {
  if (!schedule?.frequency || !isDate(deadline)) return '';
  for (const row of iterateControlCheckpoints(schedule, { from: DATE_LIMITS.MIN, to: deadline, deadline })) {
    if (row.scheduled && !row.mark) return row.date;
  }
  return '';
}
