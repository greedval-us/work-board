import { localDate, validateDate } from '../../shared/dates.js';
import { buildDeadlineNotifications, deadlineNotificationHorizon } from '../../shared/deadlineNotifications.js';
import { validateRecord } from '../../shared/validation.js';
import { ValidationError } from '../../shared/errors.js';

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

  list() { return this.#snapshot(this.#candidates(), this.repository.get()); }

  #candidates() {
    const today = validateDate(this.today());
    const planningEnabled = this.isPlanningEnabled();
    const horizon = deadlineNotificationHorizon(today);
    const request = { filters: { deadlineTo: horizon } };
    const items = buildDeadlineNotifications({
      instructions: this.instructions.all(request),
      scheduledInstructions: this.instructions.scheduledForCalendar(),
      plans: planningEnabled ? this.plans.all(request) : [],
      scheduledPlans: planningEnabled ? this.plans.scheduledForCalendar() : [],
      tasks: [...this.tasks.occurrences({ from: today, to: horizon }), ...this.tasks.overdueBefore(today)], today,
    });
    return { today, planningEnabled, items };
  }

  #snapshot({ today, items }, receipts) {
    return { today, ...(this.getDeliveryStatus ? { delivery: this.getDeliveryStatus() } : {}), items: items.map(item => {
      const receipt = receipts.get(item.id);
      const current = receipt?.occurrence === item.occurrence;
      return { ...item, unread: !(current && receipt.read), popupPending: !(current && receipt.popup) };
    }) };
  }

  acknowledge(value) {
    const request = validateAcknowledgement(value);
    const { candidates, receipts } = this.repository.acknowledge(() => this.#candidates(), request);
    if (this.today() !== candidates.today) return this.list();
    return this.#snapshot(candidates, receipts);
  }

  recordShown(items) {
    const result = this.repository.acknowledge(() => this.#candidates(), { items, popup: true }, { onlyPendingPopups: true });
    return result.matched;
  }
}
