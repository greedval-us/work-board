import { isPlanNotification } from '../../shared/notificationReference.js';

const RECEIPTS_KEY = 'notifications.receipts.v1';

export class NotificationStateRepository {
  constructor(database) { this.database = database; }

  get() {
    const row = this.database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get(RECEIPTS_KEY);
    if (!row) return new Map();
    const receipts = JSON.parse(row.value);
    if (!Array.isArray(receipts) || receipts.some(receipt => !receipt || typeof receipt.id !== 'string'
      || typeof receipt.occurrence !== 'string' || typeof receipt.read !== 'boolean' || typeof receipt.popup !== 'boolean')) {
      throw new TypeError('Состояние уведомлений имеет неверный формат.');
    }
    return new Map(receipts.map(receipt => [receipt.id, receipt]));
  }

  acknowledge(loadCandidates, { items, read, popup }, { onlyPendingPopups = false } = {}) {
    return this.database.transaction(() => {
      // Read the records under the same write lock as the receipts so an external
      // change cannot invalidate an occurrence between selection and persistence.
      const candidates = loadCandidates();
      const previous = this.get();
      const requested = new Map(items.map(item => [item.id, item.occurrence]));
      // A hidden plan can reappear on the same day with its existing receipts.
      const receipts = new Map([...previous].filter(([id, receipt]) => !candidates.planningEnabled
        && receipt.occurrence.endsWith(`:${candidates.today}`) && isPlanNotification(id.split(':', 1)[0])));
      let matched = false;
      let newlyShown = false;
      for (const item of candidates.items) {
        const saved = previous.get(item.id);
        const receipt = saved?.occurrence === item.occurrence
          ? { ...saved } : { id: item.id, occurrence: item.occurrence, read: false, popup: false };
        if (requested.get(item.id) === item.occurrence) {
          matched = true;
          if (read) receipt.read = true;
          if (popup && !receipt.popup) {
            receipt.popup = true;
            newlyShown = true;
          }
        }
        if (receipt.read || receipt.popup) receipts.set(item.id, receipt);
      }
      if (!onlyPendingPopups || newlyShown) {
        this.database.connection.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(RECEIPTS_KEY, JSON.stringify([...receipts.values()]));
      }
      return { candidates, receipts, matched };
    });
  }
}
