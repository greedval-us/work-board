import { onScopeDispose } from 'vue';
import { NOTIFICATION_CHECK_INTERVAL_MS } from '../../shared/constants/notifications.js';
import { millisecondsUntilTomorrow } from '../domain/calendarDates.js';
import { useNotificationsStore } from '../stores/notificationsStore.js';
import { subscribeNotificationOpen } from '../services/NotificationService.js';

export function useNotifications({
  store = useNotificationsStore(), windowTarget = globalThis.window, documentTarget = globalThis.document,
  now = () => new Date(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  const release = store.acquire();
  const unsubscribe = subscribeNotificationOpen(payload => { void store.openFromSystem(payload); });
  let timer;
  function tick() {
    cancel(timer);
    if (documentTarget?.visibilityState !== 'hidden') void store.refresh();
    // Check external database edits as well as the midnight transition.
    scheduleNextCheck();
  }
  function scheduleNextCheck() {
    timer = schedule(tick, Math.min(NOTIFICATION_CHECK_INTERVAL_MS, millisecondsUntilTomorrow(now())));
  }
  scheduleNextCheck();
  windowTarget?.addEventListener('focus', tick);
  documentTarget?.addEventListener('visibilitychange', tick);
  onScopeDispose(() => {
    release(); unsubscribe(); cancel(timer);
    windowTarget?.removeEventListener('focus', tick);
    documentTarget?.removeEventListener('visibilitychange', tick);
  });
  return store;
}
