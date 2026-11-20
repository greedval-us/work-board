import { listControlCheckpoints } from '../../shared/controlSchedule.js';
import { DATE_LIMITS } from '../../shared/constants/dates.js';
import { addCalendarDays, isDate } from '../../shared/dates.js';
import { instructionDeadline } from '../../shared/registry.js';

function* analyticsCheckpoints(schedule, { from, to, deadline }) {
  if (!schedule.frequency || schedule.frequency === 'custom' || !isDate(schedule.firstDate)) {
    yield* listControlCheckpoints(schedule, { from, to, deadline });
    return;
  }

  // Only legacy automatic schedules can generate dates across the whole supported range.
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

export function* analyticsControls(records, { from = '', to = '' } = {}) {
  const first = from || DATE_LIMITS.MIN;
  const last = to || DATE_LIMITS.MAX;
  for (const { controlSchedule, executorKey, executorLabel, ...item } of records) {
    const deadline = instructionDeadline(item);
    const closed = item.closedAt !== null;
    if (deadline >= first && deadline <= last) {
      yield { item, date: deadline, closed, executorKey, executorLabel };
    }
    if (!controlSchedule) continue;
    const schedule = JSON.parse(controlSchedule);
    // Closing an instruction stops unmarked checkpoints, while saved marks remain part of its history.
    const planning = closed ? { marks: schedule.marks } : schedule;
    for (const checkpoint of analyticsCheckpoints(planning, { from: first, to: last, deadline })) {
      const checkpointClosed = Boolean(checkpoint.mark);
      if (!checkpoint.scheduled && !checkpointClosed) continue;
      yield { item: { ...item, checkpointDate: checkpoint.date, checkpointClosed }, date: checkpoint.date,
        closed: checkpointClosed, executorKey, executorLabel };
    }
  }
}
