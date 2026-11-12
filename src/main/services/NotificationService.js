import { addCalendarDays, localDate, validateDate } from '../../shared/dates.js';
import { URGENCY_WINDOW_DAYS } from '../../shared/constants/registry.js';
import { buildDeadlineNotifications } from '../../shared/deadlineNotifications.js';
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
  constructor({ instructions, tasks, repository, today = localDate, getDeliveryStatus }) {
    Object.assign(this, { instructions, tasks, repository, today, getDeliveryStatus });
  }

  list() {
    const today = validateDate(this.today());
    const horizon = addCalendarDays(today, URGENCY_WINDOW_DAYS);
    const items = buildDeadlineNotifications({
      instructions: this.instructions.all({ filters: { deadlineTo: horizon } }),
      scheduledInstructions: this.instructions.scheduledForCalendar(),
      tasks: this.tasks.list({ to: horizon }), today,
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
