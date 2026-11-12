import { onScopeDispose } from 'vue';
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
    timer = schedule(tick, Math.min(60_000, millisecondsUntilTomorrow(now())));
  }
  timer = schedule(tick, Math.min(60_000, millisecondsUntilTomorrow(now())));
  windowTarget?.addEventListener('focus', tick);
  documentTarget?.addEventListener('visibilitychange', tick);
  onScopeDispose(() => {
    release(); unsubscribe(); cancel(timer);
    windowTarget?.removeEventListener('focus', tick);
    documentTarget?.removeEventListener('visibilitychange', tick);
  });
  return store;
}
