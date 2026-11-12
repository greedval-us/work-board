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

  acknowledge(candidates, acknowledgements, { read, popup }) {
    return this.database.transaction(() => {
      const previous = this.get();
      const requested = new Map(acknowledgements.map(item => [item.id, item.occurrence]));
      const receipts = [];
      for (const item of candidates) {
        const saved = previous.get(item.id);
        const receipt = saved?.occurrence === item.occurrence
          ? { ...saved } : { id: item.id, occurrence: item.occurrence, read: false, popup: false };
        if (requested.get(item.id) === item.occurrence) {
          if (read) receipt.read = true;
          if (popup) receipt.popup = true;
        }
        if (receipt.read || receipt.popup) receipts.push(receipt);
      }
      this.database.connection.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(RECEIPTS_KEY, JSON.stringify(receipts));
    });
  }
}
