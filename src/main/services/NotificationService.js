import { localDate, validateDate } from '../../shared/dates.js';
import { buildDeadlineNotifications, deadlineNotificationHorizon } from '../../shared/deadlineNotifications.js';
import { validateRecord } from '../../shared/validation.js';
import { ValidationError } from '../../shared/errors.js';
import { isPlanNotification } from '../../shared/notificationReference.js';

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
  constructor({ instructions, tasks, plans, isPlanningEnabled = () => false, repository, today = localDate, getDeliveryStatus }) {
    Object.assign(this, { instructions, tasks, plans, isPlanningEnabled, repository, today, getDeliveryStatus });
  }

  list() { return this.#snapshot(this.isPlanningEnabled()); }

  #snapshot(planningEnabled) {
    const today = validateDate(this.today());
    const horizon = deadlineNotificationHorizon(today);
    const request = { filters: { deadlineTo: horizon } };
    const items = buildDeadlineNotifications({
      instructions: this.instructions.all(request),
      scheduledInstructions: this.instructions.scheduledForCalendar(),
      plans: planningEnabled ? this.plans.all(request) : [],
      scheduledPlans: planningEnabled ? this.plans.scheduledForCalendar() : [],
      tasks: [...this.tasks.occurrences({ from: today, to: horizon }), ...this.tasks.overdueBefore(today)], today,
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
    const enabled = this.isPlanningEnabled();
    const snapshot = this.#snapshot(enabled);
    // Hidden plans can reappear on the same day. Keep their read and popup
    // receipts when the user acknowledges an unrelated task or instruction.
    const keepHidden = receipt => !enabled && receipt.occurrence.endsWith(`:${snapshot.today}`)
      && isPlanNotification(receipt.id.split(':', 1)[0]);
    this.repository.acknowledge(snapshot.items, request.items, request, keepHidden);
    return this.list();
  }
}
