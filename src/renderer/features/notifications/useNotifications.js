import { onScopeDispose, watch } from 'vue';
import { NOTIFICATION_CHECK_INTERVAL_MS } from '../../../shared/constants/notifications.js';
import { millisecondsUntilTomorrow } from '../../ui/calendarDates.js';
import { useNotificationsStore } from './notificationsStore.js';

export function useNotifications({
  store = useNotificationsStore(), windowTarget = globalThis.window, documentTarget = globalThis.document,
  now = () => new Date(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  const release = store.acquire();
  let timer;
  function syncPolling(refresh = false) {
    cancel(timer);
    timer = undefined;
    if (store.paused || documentTarget?.visibilityState === 'hidden') return;
    if (refresh) void store.refresh();
    // Check external database edits as well as the midnight transition.
    timer = schedule(tick, Math.min(NOTIFICATION_CHECK_INTERVAL_MS, millisecondsUntilTomorrow(now())));
  }
  const tick = () => syncPolling(true);
  syncPolling();
  watch(() => store.paused, () => syncPolling(), { flush: 'sync' });
  windowTarget?.addEventListener('focus', tick);
  documentTarget?.addEventListener('visibilitychange', tick);
  onScopeDispose(() => {
    release(); cancel(timer);
    windowTarget?.removeEventListener('focus', tick);
    documentTarget?.removeEventListener('visibilitychange', tick);
  });
  return store;
}
