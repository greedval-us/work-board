import { iterateControlCheckpoints } from '../../shared/controlSchedule.js';
import { DATE_LIMITS } from '../../shared/constants/dates.js';
import { instructionDeadline } from '../../shared/registry.js';

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
    for (const checkpoint of iterateControlCheckpoints(planning, { from: first, to: last, deadline })) {
      const checkpointClosed = Boolean(checkpoint.mark);
      if (!checkpoint.scheduled && !checkpointClosed) continue;
      yield { item: { ...item, checkpointDate: checkpoint.date, checkpointClosed }, date: checkpoint.date,
        closed: checkpointClosed, executorKey, executorLabel };
    }
  }
}
