import { formatDate } from '../../shared/dates.js';

const CHECK_INTERVAL_MS = 60_000;
const SHOW_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const MAX_RETAINED_NOTIFICATIONS = 32;
const DELIVERY_ERROR = 'Windows не удалось показать напоминание. Проверьте разрешения уведомлений для Work Board.';
const STATUS_ERRORS = {
  delivery: DELIVERY_ERROR,
  receipt: 'Не удалось сохранить состояние показанных уведомлений. Повторите обновление.',
  check: 'Не удалось проверить сроки в базе данных. Повторите обновление уведомлений.',
};
const reference = ({ id, occurrence }) => ({ id, occurrence });
const keyOf = item => JSON.stringify([item.id, item.occurrence]);

function notificationOptions(items) {
  const lines = items.slice(0, 3).map(item => `${formatDate(item.date)}: ${item.title.replace(/\s+/g, ' ').slice(0, 120)}`);
  if (items.length > 3) lines.push(`Ещё напоминаний: ${items.length - 3}.`);
  return { title: `Work Board — напоминания о сроках (${items.length})`, body: lines.join('\n') };
}

// Electron is supplied by the composition root; this scheduler outlives any renderer window.
export class NativeNotificationScheduler {
  #running = false;
  #checking = false;
  #interval = null;
  #scope = null;
  #attempts = new Map();
  #deliveries = new Set();
  #error = '';
  #errorKind = null;
  #wake = () => this.check();

  constructor({ database, notifications, createNotification, isSupported, onOpen,
    powerMonitor = null, logger = console, timers = globalThis, now = Date.now }) {
    Object.assign(this, { database, notifications, createNotification, isSupported, onOpen, powerMonitor, logger, timers, now });
  }

  getStatus() { return { mode: this.#running ? 'system' : 'in-app', error: this.#error }; }

  start() {
    if (this.#running) return true;
    try { if (!this.isSupported()) return false; }
    catch (error) { this.logger.error('Cannot detect native notification support.', error); return false; }
    this.#running = true;
    this.#interval = this.timers.setInterval(() => this.check(), CHECK_INTERVAL_MS);
    this.powerMonitor?.on('resume', this.#wake);
    this.powerMonitor?.on('unlock-screen', this.#wake);
    this.check();
    return true;
  }

  stop() {
    this.#running = false;
    if (this.#interval !== null) this.timers.clearInterval(this.#interval);
    this.#interval = null;
    this.powerMonitor?.removeListener('resume', this.#wake);
    this.powerMonitor?.removeListener('unlock-screen', this.#wake);
    this.#clearScope();
    this.#error = '';
  }

  check() {
    if (!this.#running || this.#checking) return;
    this.#checking = true;
    try {
      const { ready, generation } = this.database.getStatus();
      if (!ready) { this.#clearScope(); return; }
      const snapshot = this.notifications.list();
      if (this.#errorKind === 'check') { this.#error = ''; this.#errorKind = null; }
      this.database.assertGeneration(generation);
      if (this.#scope?.generation !== generation || this.#scope?.today !== snapshot.today) {
        this.#clearScope();
        this.#scope = { generation, today: snapshot.today };
      }
      const currentKeys = new Set(snapshot.items.map(keyOf));
      for (const key of this.#attempts.keys()) if (!currentKeys.has(key)) this.#attempts.delete(key);
      for (const delivery of this.#deliveries) {
        if (delivery.items.some(item => !currentKeys.has(keyOf(item)))) this.#dispose(delivery);
      }
      this.#retryReceipts(snapshot.items, generation);
      const pending = snapshot.items.filter(item => {
        const attempt = this.#attempts.get(keyOf(item));
        return (item.popupPending || attempt?.forcePending) && !attempt?.shown && !attempt?.pending
          && (attempt?.count ?? 0) < MAX_ATTEMPTS && (attempt?.nextAt ?? 0) <= this.now();
      });
      if (pending.length) this.#show(pending, generation, snapshot.today);
    } catch (error) { this.#report('Cannot check native deadline notifications.', error, 'check'); }
    finally { this.#checking = false; }
  }

  #show(items, generation, today) {
    const delivery = { generation, today, items: items.map(reference), native: null,
      shown: false, clicked: false, disposed: false, timeout: null, listeners: null };
    for (const item of items) {
      const key = keyOf(item);
      this.#attempts.set(key, { count: (this.#attempts.get(key)?.count ?? 0) + 1,
        nextAt: this.now() + CHECK_INTERVAL_MS, shown: false, pending: true });
    }
    this.#deliveries.add(delivery);
    while (this.#deliveries.size > MAX_RETAINED_NOTIFICATIONS) this.#dispose(this.#deliveries.values().next().value);
    try {
      delivery.native = this.createNotification(notificationOptions(items));
      delivery.listeners = {
        show: () => this.#onShow(delivery),
        click: () => this.#onClick(delivery),
        failed: (_event, error) => this.#fail(delivery, error),
        // Windows may hide the toast while retaining an actionable entry in Action Center.
        close: () => { if (!delivery.shown) this.#fail(delivery, new Error('Notification closed before showing.')); },
      };
      for (const [event, handler] of Object.entries(delivery.listeners)) delivery.native.on(event, handler);
      delivery.timeout = this.timers.setTimeout(() => this.#fail(delivery, new Error('Native notification did not confirm display.')), SHOW_TIMEOUT_MS);
      delivery.native.show();
    } catch (error) { this.#fail(delivery, error); }
  }

  #currentItems(delivery) {
    if (!this.#running || delivery.disposed) return [];
    const status = this.database.getStatus();
    if (!status.ready || status.generation !== delivery.generation) return [];
    const snapshot = this.notifications.list();
    this.database.assertGeneration(delivery.generation);
    if (snapshot.today !== delivery.today) return [];
    const current = new Map(snapshot.items.map(item => [keyOf(item), item]));
    return delivery.items.map(item => current.get(keyOf(item))).filter(Boolean);
  }

  #onShow(delivery) {
    if (delivery.shown || delivery.disposed) return;
    // Windows accepted delivery even if the database is temporarily unreadable.
    // Keep session deduplication independent from persistence to prevent repeated toasts.
    delivery.shown = true;
    this.#clearTimeout(delivery);
    for (const item of delivery.items) {
      const attempt = this.#attempts.get(keyOf(item));
      if (attempt) { attempt.shown = true; attempt.pending = false; }
    }
    try {
      const current = this.#currentItems(delivery);
      if (!current.length) { this.#dispose(delivery); return; }
      this.#error = '';
      this.#errorKind = null;
      const pending = current.filter(item => item.popupPending).map(reference);
      if (pending.length) {
        this.database.assertGeneration(delivery.generation);
        this.notifications.acknowledge({ items: pending, popup: true });
      }
    } catch (error) {
      this.#report('Cannot save native notification delivery.', error, 'receipt');
    }
  }

  #retryReceipts(items, generation) {
    const pending = items.filter(item => item.popupPending && this.#attempts.get(keyOf(item))?.shown).map(reference);
    if (!pending.length) return;
    try {
      this.database.assertGeneration(generation);
      this.notifications.acknowledge({ items: pending, popup: true });
      if (this.#errorKind === 'receipt') { this.#error = ''; this.#errorKind = null; }
    } catch (error) { this.#report('Cannot save native notification delivery.', error, 'receipt'); }
  }

  #onClick(delivery) {
    if (delivery.clicked || delivery.disposed) return;
    try {
      const items = this.#currentItems(delivery).map(reference);
      if (!items.length) { this.#dispose(delivery); return; }
      delivery.clicked = true;
      this.database.assertGeneration(delivery.generation);
      const opened = this.onOpen({ generation: delivery.generation, today: delivery.today, items });
      Promise.resolve(opened).catch(error => this.logger.error('Cannot open native notification.', error));
    } catch (error) { this.logger.error('Cannot open native notification.', error); }
  }

  #fail(delivery, error) {
    if (delivery.disposed) return;
    // Windows can reject delivery asynchronously after Electron reports `show`.
    // A receipt cannot be rolled back, so allow a bounded retry within this session.
    for (const item of delivery.items) {
      const attempt = this.#attempts.get(keyOf(item));
      if (attempt) { attempt.shown = false; attempt.forcePending = true; }
    }
    this.#report('Cannot show native deadline notification.', error);
    this.#dispose(delivery);
  }

  #report(message, error, kind = 'delivery') {
    this.#errorKind = kind;
    this.#error = STATUS_ERRORS[kind];
    this.logger.error(message, error);
  }

  #clearTimeout(delivery) {
    if (delivery.timeout !== null) this.timers.clearTimeout(delivery.timeout);
    delivery.timeout = null;
  }

  #dispose(delivery) {
    if (delivery.disposed) return;
    delivery.disposed = true;
    this.#clearTimeout(delivery);
    for (const item of delivery.items) {
      const attempt = this.#attempts.get(keyOf(item));
      if (attempt) attempt.pending = false;
    }
    if (delivery.native) {
      for (const [event, handler] of Object.entries(delivery.listeners ?? {})) delivery.native.removeListener(event, handler);
      try { delivery.native.close(); }
      catch (error) { this.logger.error('Cannot close native notification.', error); }
    }
    this.#deliveries.delete(delivery);
  }

  #clearScope() {
    for (const delivery of this.#deliveries) this.#dispose(delivery);
    this.#attempts.clear();
    this.#scope = null;
    this.#error = '';
    this.#errorKind = null;
  }
}
