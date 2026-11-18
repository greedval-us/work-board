import { NOTIFICATION_CHECK_INTERVAL_MS } from '../../../shared/constants/notifications.js';
import { notificationKey, notificationReference } from '../../../shared/notificationReference.js';

const MAX_ATTEMPTS = 3;

// Tracks delivery separately from persisted receipts for the current database and day.
export class NotificationDeliveryAttempts {
  #entries = new Map();

  due(items, now) {
    return items.filter(item => {
      const attempt = this.#entries.get(notificationKey(item));
      if (!attempt) return item.popupPending;
      return (item.popupPending || attempt.state === 'failed')
        && attempt.state !== 'shown' && attempt.state !== 'pending'
        && attempt.count < MAX_ATTEMPTS && attempt.nextAt <= now;
    });
  }

  begin(items, now) {
    for (const item of items) {
      const key = notificationKey(item);
      const count = (this.#entries.get(key)?.count ?? 0) + 1;
      this.#entries.set(key, { count, nextAt: now + NOTIFICATION_CHECK_INTERVAL_MS, state: 'pending' });
    }
  }

  #setState(items, state, previousState) {
    for (const item of items) {
      const attempt = this.#entries.get(notificationKey(item));
      if (attempt && (!previousState || attempt.state === previousState)) attempt.state = state;
    }
  }

  shown(items) { this.#setState(items, 'shown'); }

  // Windows can reject a toast after accepting it, even after a receipt was saved.
  failed(items) { this.#setState(items, 'failed'); }

  release(items) { this.#setState(items, 'released', 'pending'); }

  receipts(items) {
    return items.filter(item => item.popupPending && this.#entries.get(notificationKey(item))?.state === 'shown')
      .map(notificationReference);
  }

  retain(currentKeys) {
    for (const key of this.#entries.keys()) if (!currentKeys.has(key)) this.#entries.delete(key);
  }

  clear() { this.#entries.clear(); }
}
