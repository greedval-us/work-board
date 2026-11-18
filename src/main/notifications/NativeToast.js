import { formatDate } from '../../shared/dates.js';

const SHOW_TIMEOUT_MS = 15_000;
const PREVIEW_ITEM_LIMIT = 3;
const PREVIEW_TITLE_LIMIT = 120;

function notificationOptions(items) {
  const lines = items.slice(0, PREVIEW_ITEM_LIMIT).map(item => {
    const title = item.title.replace(/\s+/g, ' ').slice(0, PREVIEW_TITLE_LIMIT);
    return `${formatDate(item.date)}: ${title}`;
  });
  if (items.length > PREVIEW_ITEM_LIMIT) lines.push(`Ещё напоминаний: ${items.length - PREVIEW_ITEM_LIMIT}.`);
  return { title: `Work Board — напоминания о сроках (${items.length})`, body: lines.join('\n') };
}

// Owns one Electron notification, including its listeners after Windows hides the banner.
export class NativeToast {
  #native;
  #listeners;
  #timeout = null;
  #shown = false;
  #disposed = false;

  constructor({ createNotification, timers, logger }) {
    Object.assign(this, { createNotification, timers, logger });
  }

  show(items, { onShow, onClick, onFailure }) {
    try {
      this.#native = this.createNotification(notificationOptions(items));
      this.#listeners = {
        show: () => {
          if (this.#shown || this.#disposed) return;
          this.#shown = true;
          this.#clearTimeout();
          onShow();
        },
        click: () => { if (!this.#disposed) onClick(); },
        failed: (_event, error) => { if (!this.#disposed) onFailure(error); },
        close: () => {
          if (!this.#shown && !this.#disposed) onFailure(new Error('Notification closed before showing.'));
        },
      };
      for (const [event, handler] of Object.entries(this.#listeners)) this.#native.on(event, handler);
      this.#timeout = this.timers.setTimeout(() => onFailure(new Error('Native notification did not confirm display.')), SHOW_TIMEOUT_MS);
      this.#native.show();
    } catch (error) { onFailure(error); }
  }

  #clearTimeout() {
    if (this.#timeout !== null) this.timers.clearTimeout(this.#timeout);
    this.#timeout = null;
  }

  dispose() {
    this.#disposed = true;
    this.#clearTimeout();
    if (!this.#native) return;
    for (const [event, handler] of Object.entries(this.#listeners)) this.#native.removeListener(event, handler);
    try { this.#native.close(); }
    catch (error) { this.logger.error('Cannot close native notification.', error); }
  }
}
