import { addCalendarDays, localDate, validateDate } from '../../shared/dates.js';
import { DATE_LIMITS } from '../../shared/constants/dates.js';
import { buildDeadlineNotifications, deadlineNotificationHorizon } from '../../shared/deadlineNotifications.js';
import { taskOccurrenceDates } from '../../shared/taskRecurrence.js';
import { validateRecord } from '../../shared/validation.js';
import { ValidationError } from '../../shared/errors.js';

// One window includes 366 calendar dates, enough to cover the longest ordinary repeat interval.
const TASK_LOOKBACK_OFFSET_DAYS = 365;

function latestUnmovedTaskDate(task, through, movedOrigins, previousCandidate) {
  const earliest = previousCandidate > task.date ? previousCandidate : task.date;
  let to = through;
  while (to >= earliest) {
    const lookback = task.recurrence.frequency === 'custom' ? earliest : addCalendarDays(to, -TASK_LOOKBACK_OFFSET_DAYS);
    const from = lookback < earliest ? earliest : lookback;
    let latest;
    for (const date of taskOccurrenceDates(task, { from, to })) {
      if (!movedOrigins?.has(date)) latest = date;
    }
    if (latest || from === earliest) return latest;
    to = addCalendarDays(from, -1);
  }
  return undefined;
}

function taskReminderOccurrences(tasks, today, horizon) {
  const pending = tasks.occurrences({ from: today, to: horizon });
  if (today === DATE_LIMITS.MIN) return pending;

  const yesterday = addCalendarDays(today, -1);
  const moved = new Map();
  const latestPast = new Map();
  for (const { taskId, originalDate, date } of tasks.occurrenceMoves()) {
    if (!moved.has(taskId)) moved.set(taskId, new Set());
    moved.get(taskId).add(originalDate);
    if (date <= yesterday && date > (latestPast.get(taskId) ?? '')) latestPast.set(taskId, date);
  }
  for (const task of tasks.list({ to: yesterday })) {
    if (!task.recurrence) {
      pending.push(task);
      continue;
    }
    const latest = latestUnmovedTaskDate(task, yesterday, moved.get(task.id), latestPast.get(task.id) ?? '');
    if (latest) latestPast.set(task.id, latest);
  }
  for (const [taskId, date] of latestPast) {
    const task = tasks.get(taskId, date);
    if (task) pending.push(task);
  }
  return pending;
}

function validateAcknowledgement(value) {
  const request = validateRecord(value, 'Подтверждение уведомлений');
  if (!Array.isArray(request.items)) throw new ValidationError('Укажите список уведомлений.');
  for (const field of ['read', 'popup']) {
    if (request[field] !== undefined && typeof request[field] !== 'boolean') {
      throw new ValidationError('Отметка уведомления: укажите да или нет.');
    }
  }
  const items = request.items.map(value => {
    const { id, occurrence } = validateRecord(value, 'Уведомление');
    if (typeof id !== 'string' || !id.trim() || id.length > 512) throw new ValidationError('Некорректный идентификатор уведомления.');
    if (typeof occurrence !== 'string' || occurrence.length !== 21 || occurrence[10] !== ':') {
      throw new ValidationError('Некорректная дата уведомления.');
    }
    validateDate(occurrence.slice(0, 10), 'Срок уведомления');
    validateDate(occurrence.slice(11), 'Дата уведомления');
    return { id, occurrence };
  });
  return { items, read: request.read, popup: request.popup };
}

export class NotificationService {
  constructor({ instructions, tasks, repository, today = localDate, getDeliveryStatus }) {
    Object.assign(this, { instructions, tasks, repository, today, getDeliveryStatus });
  }

  list() {
    const today = validateDate(this.today());
    const horizon = deadlineNotificationHorizon(today);
    const items = buildDeadlineNotifications({
      instructions: this.instructions.all({ filters: { deadlineTo: horizon } }),
      scheduledInstructions: this.instructions.scheduledForCalendar(),
      tasks: taskReminderOccurrences(this.tasks, today, horizon), today,
    });
    const receipts = this.repository.get();
    return { today, ...(this.getDeliveryStatus ? { delivery: this.getDeliveryStatus() } : {}), items: items.map(item => {
      const receipt = receipts.get(item.id);
      const current = receipt?.occurrence === item.occurrence;
      return { ...item, unread: !(current && receipt.read), popupPending: !(current && receipt.popup) };
    }) };
  }

  acknowledge(value) {
    const request = validateAcknowledgement(value);
    this.repository.acknowledge(this.list().items, request.items, request);
    return this.list();
  }
}
