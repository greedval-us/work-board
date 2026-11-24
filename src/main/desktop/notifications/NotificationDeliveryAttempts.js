import { NOTIFICATION_CHECK_INTERVAL_MS } from '../../../shared/constants/notifications.js';
import { notificationKey, notificationReference } from '../../../shared/notificationReference.js';

const MAX_ATTEMPTS = 3;

function canRetry(item, attempt) {
  return attempt && attempt.count < MAX_ATTEMPTS
    && (attempt.state === 'retry' || (attempt.state === 'released' && item.popupPending));
}

// Tracks delivery separately from persisted receipts for the current database and day.
export class NotificationDeliveryAttempts {
  #entries = new Map();

  due(items, now) {
    return items.filter(item => {
      const attempt = this.#entries.get(notificationKey(item));
      if (!attempt) return item.popupPending;
      return canRetry(item, attempt) && attempt.nextAt <= now;
    });
  }

  hasPendingWork(items) {
    return items.some(item => {
      const attempt = this.#entries.get(notificationKey(item));
      return canRetry(item, attempt) || (item.popupPending && attempt?.state === 'shown');
    });
  }

  begin(items, now) {
    for (const item of items) {
      const key = notificationKey(item);
      const count = (this.#entries.get(key)?.count ?? 0) + 1;
      this.#entries.set(key, { count, nextAt: now + NOTIFICATION_CHECK_INTERVAL_MS, state: 'pending' });
    }
  }

  #setState(items, state) {
    for (const item of items) {
      const attempt = this.#entries.get(notificationKey(item));
      if (attempt) attempt.state = state;
    }
  }

  shown(items) { this.#setState(items, 'shown'); }

  // Windows can reject a toast after accepting it, even after a receipt was saved.
  failed(items) { this.#setState(items, 'retry'); }

  release(items, replaceAt) {
    for (const item of items) {
      const attempt = this.#entries.get(notificationKey(item));
      if (attempt?.state !== 'pending') continue;
      if (replaceAt === undefined) attempt.state = 'released';
      else {
        // Replacing a preview for privacy is not a delivery failure.
        attempt.state = 'retry';
        attempt.count--;
        attempt.nextAt = replaceAt;
      }
    }
  }

  receipts(items) {
    return items.filter(item => item.popupPending && this.#entries.get(notificationKey(item))?.state === 'shown')
      .map(notificationReference);
  }

  retain(currentKeys) {
    for (const key of this.#entries.keys()) if (!currentKeys.has(key)) this.#entries.delete(key);
  }

  clear() { this.#entries.clear(); }
}
