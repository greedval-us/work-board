import { NOTIFICATION_CHECK_INTERVAL_MS as CHECK_INTERVAL_MS } from '../../../shared/constants/notifications.js';
import { notificationKey, notificationReference } from '../../../shared/notificationReference.js';
import { NativeToast } from './NativeToast.js';
import { NotificationDeliveryAttempts } from './NotificationDeliveryAttempts.js';

const MAX_RETAINED_NOTIFICATIONS = 32;
const STATUS_ERRORS = {
  delivery: 'Windows не удалось показать напоминание. Проверьте разрешения уведомлений для Work Board.',
  receipt: 'Не удалось сохранить состояние показанных уведомлений. Повторите обновление.',
  check: 'Не удалось проверить сроки в базе данных. Повторите обновление уведомлений.',
};

// Electron is supplied by the composition root; this scheduler outlives any renderer window.
export class NativeNotificationScheduler {
  #running = false;
  #checking = false;
  #interval = null;
  #scope = null;
  #attempts = new NotificationDeliveryAttempts();
  #deliveries = new Set();
  #errorKind = null;
  #wake = () => this.check();

  constructor({ database, notifications, createNotification, isSupported, onOpen,
    powerMonitor = null, logger = console, timers = globalThis, now = Date.now }) {
    Object.assign(this, { database, notifications, createNotification, isSupported, onOpen, powerMonitor, logger, timers, now });
  }

  getStatus() { return { mode: this.#running ? 'system' : 'in-app', error: STATUS_ERRORS[this.#errorKind] ?? '' }; }

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
  }

  check() {
    if (!this.#running || this.#checking) return;
    this.#checking = true;
    try {
      const { ready, generation } = this.database.connectionState;
      if (!ready) { this.#clearScope(); return; }
      if (this.#scope && this.#scope.generation !== generation) this.#clearScope();
      const snapshot = this.notifications.list();
      if (this.#errorKind === 'check') this.#errorKind = null;
      this.database.assertGeneration(generation);
      if (this.#scope?.today !== snapshot.today) {
        this.#clearScope();
        this.#scope = { generation, today: snapshot.today };
      }
      const currentKeys = new Set(snapshot.items.map(notificationKey));
      this.#attempts.retain(currentKeys);
      for (const delivery of this.#deliveries) {
        if (delivery.items.some(item => !currentKeys.has(notificationKey(item)))) this.#dispose(delivery);
      }
      this.#saveShownReceipts(snapshot.items, generation);
      const pending = this.#attempts.due(snapshot.items, this.now());
      if (pending.length) this.#show(pending, generation, snapshot.today);
    } catch (error) { this.#report('Cannot check native deadline notifications.', error, 'check'); }
    finally { this.#checking = false; }
  }

  #show(items, generation, today) {
    const toast = new NativeToast({ createNotification: this.createNotification, timers: this.timers, logger: this.logger });
    const delivery = { generation, today, items: items.map(notificationReference), clicked: false, toast };
    this.#attempts.begin(items, this.now());
    this.#deliveries.add(delivery);
    while (this.#deliveries.size > MAX_RETAINED_NOTIFICATIONS) this.#dispose(this.#deliveries.values().next().value);
    toast.show(items, {
      onShow: () => this.#onShow(delivery),
      onClick: () => this.#onClick(delivery),
      onFailure: error => this.#fail(delivery, error),
    });
  }

  #currentItems(delivery) {
    if (!this.#running || !this.#deliveries.has(delivery)) return [];
    const status = this.database.connectionState;
    if (!status.ready || status.generation !== delivery.generation) return [];
    const snapshot = this.notifications.list();
    this.database.assertGeneration(delivery.generation);
    if (snapshot.today !== delivery.today) return [];
    const current = new Map(snapshot.items.map(item => [notificationKey(item), item]));
    return delivery.items.map(item => current.get(notificationKey(item))).filter(Boolean);
  }

  #onShow(delivery) {
    this.#attempts.shown(delivery.items);
    try {
      const current = this.#currentItems(delivery);
      if (!current.length) { this.#dispose(delivery); return; }
      this.#errorKind = null;
      this.#saveShownReceipts(current, delivery.generation);
    } catch (error) {
      this.#report('Cannot save native notification delivery.', error, 'receipt');
    }
  }

  #saveShownReceipts(items, generation) {
    const pending = this.#attempts.receipts(items);
    if (!pending.length) return;
    try {
      this.database.assertGeneration(generation);
      this.notifications.acknowledge({ items: pending, popup: true });
      if (this.#errorKind === 'receipt') this.#errorKind = null;
    } catch (error) { this.#report('Cannot save native notification delivery.', error, 'receipt'); }
  }

  #onClick(delivery) {
    if (delivery.clicked) return;
    try {
      const items = this.#currentItems(delivery).map(notificationReference);
      if (!items.length) { this.#dispose(delivery); return; }
      delivery.clicked = true;
      this.database.assertGeneration(delivery.generation);
      const opened = this.onOpen({ generation: delivery.generation, today: delivery.today, items });
      Promise.resolve(opened).catch(error => this.logger.error('Cannot open native notification.', error));
    } catch (error) { this.logger.error('Cannot open native notification.', error); }
  }

  #fail(delivery, error) {
    if (!this.#deliveries.has(delivery)) return;
    this.#attempts.failed(delivery.items);
    this.#report('Cannot show native deadline notification.', error);
    this.#dispose(delivery);
  }

  #report(message, error, kind = 'delivery') {
    this.#errorKind = kind;
    this.logger.error(message, error);
  }

  #dispose(delivery) {
    if (!this.#deliveries.delete(delivery)) return;
    this.#attempts.release(delivery.items);
    delivery.toast.dispose();
  }

  #clearScope() {
    for (const delivery of this.#deliveries) this.#dispose(delivery);
    this.#attempts.clear();
    this.#scope = null;
    this.#errorKind = null;
  }
}
