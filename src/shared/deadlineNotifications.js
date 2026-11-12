import { addCalendarDays, validateDate } from './dates.js';
import { instructionDeadline } from './registry.js';
import { INSTRUCTION_STATUS, URGENCY_WINDOW_DAYS } from './constants/registry.js';
import { listControlCheckpoints } from './controlSchedule.js';

function notification(kind, record, date, today, checkpointDate = '') {
  return {
    id: `${kind}:${record.id}:${record.createdAt}${checkpointDate ? `:${checkpointDate}` : ''}`,
    occurrence: `${date}:${today}`,
    kind, recordId: record.id, date, title: record.title,
    ...(kind === 'task' ? {} : { instructionNumber: record.instructionNumber }),
  };
}

function firstCheckpointDate(schedule, fallback) {
  return [schedule.firstDate, ...schedule.customDates, ...(schedule.moves ?? []).map(move => move.to)]
    .filter(Boolean).sort()[0] ?? fallback;
}

// Derive reminders from current records; receipt state never keeps finished work alive.
export function buildDeadlineNotifications({ instructions, scheduledInstructions, tasks, today }) {
  validateDate(today);
  const horizon = addCalendarDays(today, URGENCY_WINDOW_DAYS);
  const items = [];
  for (const record of instructions) {
    const date = instructionDeadline(record);
    if (record.status !== INSTRUCTION_STATUS.COMPLETED && date <= horizon) {
      items.push(notification('instruction', record, date, today));
    }
  }
  for (const record of tasks) {
    if (!record.completed && record.date <= horizon) items.push(notification('task', record, record.date, today));
  }
  for (const record of scheduledInstructions) {
    if (record.status === INSTRUCTION_STATUS.COMPLETED) continue;
    const schedule = record.controlSchedule;
    const checkpoints = listControlCheckpoints(schedule, {
      from: firstCheckpointDate(schedule, horizon), to: horizon, deadline: instructionDeadline(record),
    });
    for (const checkpoint of checkpoints) {
      if (!checkpoint.scheduled || checkpoint.mark.trim()) continue;
      items.push(notification('checkpoint', record, checkpoint.date, today, checkpoint.originalDate ?? checkpoint.date));
    }
  }
  return items.sort((left, right) => left.date.localeCompare(right.date)
    || left.kind.localeCompare(right.kind) || left.recordId - right.recordId || left.id.localeCompare(right.id));
}
