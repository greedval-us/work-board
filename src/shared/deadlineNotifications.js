import { addCalendarDays, validateDate } from './dates.js';
import { instructionDeadline } from './registry.js';
import { INSTRUCTION_STATUS, URGENCY_WINDOW_DAYS } from './constants/registry.js';
import { iterateControlCheckpoints } from './controlSchedule.js';
import { isPlanNotification } from './notificationReference.js';

function notification(kind, record, date, today, scheduledDate = '') {
  return {
    id: `${kind}:${record.id}:${record.createdAt}${scheduledDate ? `:${scheduledDate}` : ''}`,
    occurrence: `${date}:${today}`,
    kind, recordId: record.id, date, title: record.title,
    ...(kind === 'task' ? {} : { instructionNumber: record.instructionNumber }),
    ...(isPlanNotification(kind) ? { planItem: record.planItem } : {}),
  };
}

export function deadlineNotificationHorizon(today) {
  return addCalendarDays(today, URGENCY_WINDOW_DAYS);
}

function firstCheckpointDate(schedule, fallback) {
  return [schedule.firstDate, ...schedule.customDates, ...Object.values(schedule.periodDates ?? {}), ...(schedule.moves ?? []).map(move => move.to)]
    .filter(Boolean).sort()[0] ?? fallback;
}

// Derive reminders from current records; receipt state never keeps finished work alive.
export function buildDeadlineNotifications({ instructions, scheduledInstructions, plans = [], scheduledPlans = [], tasks, today }) {
  validateDate(today);
  const horizon = deadlineNotificationHorizon(today);
  const items = [];
  for (const [records, schedules, deadlineKind, checkpointKind] of [
    [instructions, scheduledInstructions, 'instruction', 'checkpoint'],
    [plans, scheduledPlans, 'plan', 'planCheckpoint'],
  ]) {
    for (const record of records) {
      const date = instructionDeadline(record);
      if (record.status !== INSTRUCTION_STATUS.COMPLETED && date <= horizon) {
        items.push(notification(deadlineKind, record, date, today));
      }
    }
    for (const record of schedules) {
      if (record.status === INSTRUCTION_STATUS.COMPLETED) continue;
      const schedule = record.controlSchedule;
      const checkpoints = iterateControlCheckpoints(schedule, {
        from: firstCheckpointDate(schedule, horizon), to: horizon, deadline: instructionDeadline(record),
      });
      for (const checkpoint of checkpoints) {
        if (!checkpoint.scheduled || checkpoint.mark.trim()) continue;
        items.push(notification(checkpointKind, record, checkpoint.date, today, checkpoint.originalDate ?? checkpoint.date));
      }
    }
  }
  for (const record of tasks) {
    if (!record.completed && record.date <= horizon) {
      items.push(notification('task', record, record.date, today, record.recurrence ? record.originalDate ?? record.date : ''));
    }
  }
  return items.sort((left, right) => left.date.localeCompare(right.date)
    || left.kind.localeCompare(right.kind) || left.recordId - right.recordId || left.id.localeCompare(right.id));
}
