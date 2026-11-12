import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { createRequestScope, createSingleFlight } from '../infrastructure/requestScope.js';
import { notificationService } from '../services/NotificationService.js';
import { useAppStore } from './appStore.js';

const identity = item => JSON.stringify([item.id, item.occurrence]);

export function createNotificationsStore({
  id = 'notifications', getApp = useAppStore, service = notificationService,
  canShowPopup = () => globalThis.document?.visibilityState !== 'hidden'
    && !globalThis.document?.querySelector('dialog[open]'),
} = {}) {
  return defineStore(id, () => {
    const app = getApp();
    const items = shallowRef([]);
    const today = shallowRef('');
    const loading = shallowRef(false);
    const requestError = shallowRef('');
    const delivery = shallowRef({ mode: 'in-app', error: '' });
    const error = computed(() => requestError.value || delivery.value.error);
    const openRequest = shallowRef(0);
    const popup = shallowRef(null);
    const pendingWrites = shallowRef(0);
    const saving = computed(() => pendingWrites.value > 0);
    const unreadCount = computed(() => items.value.filter(item => item.unread).length);
    const ready = computed(() => Boolean(app.database?.ready) && !app.databaseSwitching);
    const generation = computed(() => app.database?.generation);
    const scope = createRequestScope();
    const flight = createSingleFlight();
    const shown = new Set();
    let queue = Promise.resolve();
    let disposed = false;
    let consumers = 0;
    let popupWrite = false;
    let pendingSystemGeneration = null;
    const keyFor = () => JSON.stringify([generation.value, app.revision]);
    const current = (ticket, key) => !disposed && ready.value && ticket?.isCurrent() && key === keyFor();

    function applySnapshot(value) {
      delivery.value = value.delivery ?? { mode: 'in-app', error: '' };
      if (delivery.value.mode === 'system') popup.value = null;
      today.value = value.today;
      items.value = value.items;
      const active = new Map(value.items.map(item => [identity(item), item]));
      for (const key of shown) if (!active.has(key)) shown.delete(key);
      if (popup.value) {
        const remaining = popup.value.items.map(item => active.get(identity(item))).filter(Boolean);
        popup.value = remaining.length ? { items: remaining } : null;
      }
    }

    // Writes are serialized, while reads wait for the outstanding receipt writes.
    // Acknowledgement snapshots cannot overwrite a newer record revision.
    function acknowledge(selected, flags) {
      if (!ready.value || disposed || !selected.length) return Promise.resolve(false);
      const source = generation.value;
      const requested = selected.map(({ id: key, occurrence }) => ({ id: key, occurrence }));
      pendingWrites.value++;
      const operation = queue.then(async () => {
        if (disposed || !ready.value || generation.value !== source) return false;
        const key = keyFor();
        scope.invalidate();
        flight.clear();
        loading.value = false;
        requestError.value = '';
        try {
          const value = await app.withOperation(() => service.acknowledge({ generation: source, items: requested, ...flags }));
          if (!disposed && ready.value && key === keyFor()) applySnapshot(value);
          return true;
        } catch (cause) {
          if (!disposed && ready.value && key === keyFor()) {
            requestError.value = errorMessage(cause, 'Не удалось сохранить состояние уведомлений. Повторите попытку.');
          }
          return false;
        }
      }).finally(() => { pendingWrites.value--; });
      queue = operation;
      return operation;
    }

    function offerPopup() {
      if (delivery.value.mode === 'system' || !canShowPopup()) return;
      const pending = items.value.filter(item => item.popupPending);
      const fresh = pending.filter(item => !shown.has(identity(item)));
      if (fresh.length) {
        for (const item of fresh) shown.add(identity(item));
        popup.value = { items: [...(popup.value?.items ?? []), ...fresh] };
      }
      // Retry a failed receipt on the next refresh without presenting it again.
      const announced = pending.filter(item => shown.has(identity(item)));
      if (announced.length && !popupWrite) {
        popupWrite = true;
        void acknowledge(announced, { popup: true }).finally(() => { popupWrite = false; });
      }
    }

    async function refresh() {
      await queue;
      if (disposed || !ready.value) return false;
      const key = keyFor();
      const ticket = scope.issue(key);
      const source = generation.value;
      loading.value = true;
      requestError.value = '';
      try {
        const value = await flight.run(key, () => service.list({ generation: source }));
        if (current(ticket, key)) {
          applySnapshot(value);
          offerPopup();
        }
        return true;
      } catch (cause) {
        if (current(ticket, key)) requestError.value = errorMessage(cause, 'Не удалось загрузить уведомления о сроках.');
        return false;
      } finally { if (current(ticket, key)) loading.value = false; }
    }

    function invalidate(databaseChanged = false) {
      scope.invalidate();
      flight.clear();
      loading.value = false;
      requestError.value = '';
      if (databaseChanged) { items.value = []; today.value = ''; popup.value = null; shown.clear(); delivery.value = { mode: 'in-app', error: '' }; }
      if (consumers && ready.value) void refresh();
    }
    watch([generation, ready], () => {
      invalidate(true);
      if (ready.value && pendingSystemGeneration !== null) {
        const source = pendingSystemGeneration;
        pendingSystemGeneration = null;
        void openFromSystem({ generation: source });
      }
    }, { flush: 'sync' });
    watch(() => app.revision, () => invalidate(), { flush: 'sync' });
    onScopeDispose(() => { disposed = true; scope.dispose(); flight.clear(); shown.clear(); });

    function acquire() {
      consumers++;
      void refresh();
      let released = false;
      return () => { if (!released) { consumers--; released = true; } };
    }
    const markRead = item => acknowledge([item], { read: true });
    const markAllRead = () => acknowledge(items.value.filter(item => item.unread), { read: true });
    const dismissPopup = () => { popup.value = null; };
    async function openFromSystem({ generation: source } = {}) {
      if (!disposed && Number.isSafeInteger(source) && !app.database && !app.initialized && !app.databaseSwitching) {
        pendingSystemGeneration = source;
        return true;
      }
      if (disposed || !ready.value || generation.value !== source) return false;
      await refresh();
      if (disposed || !ready.value || generation.value !== source) return false;
      openRequest.value++;
      return true;
    }
    return { items, today, loading, error, popup, saving, unreadCount, openRequest, refresh, acquire, markRead, markAllRead, dismissPopup, openFromSystem };
  });
}

export const useNotificationsStore = createNotificationsStore();
