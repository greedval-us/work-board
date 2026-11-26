import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { createRequestChannel } from '../../infrastructure/requestScope.js';
import { notificationService } from './NotificationService.js';
import { useAppStore } from '../../app/appStore.js';
import { isPlanNotification, notificationKey, notificationReference } from '../../../shared/notificationReference.js';

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
    const paused = computed(() => Boolean(app.workspaceLocked));
    const available = computed(() => ready.value && !paused.value);
    const generation = computed(() => app.database?.generation);
    const requests = createRequestChannel();
    const shown = new Set();
    let queue = Promise.resolve();
    let disposed = false;
    let consumers = 0;
    let popupWrite = false;
    let pendingSystemGeneration = null;
    let lockVersion = 0;
    const keyFor = () => JSON.stringify([generation.value, app.revision, lockVersion]);
    const current = (ticket, key) => !disposed && available.value && ticket?.isCurrent() && key === keyFor();

    function setVisibleItems(next) {
      items.value = app.planningEnabled ? next : next.filter(item => !isPlanNotification(item.kind));
      const active = new Map(items.value.map(item => [notificationKey(item), item]));
      for (const key of shown) if (!active.has(key)) shown.delete(key);
      if (popup.value) {
        const remaining = popup.value.items.map(item => active.get(notificationKey(item))).filter(Boolean);
        popup.value = remaining.length ? { items: remaining } : null;
      }
    }

    function applySnapshot(value) {
      delivery.value = value.delivery ?? { mode: 'in-app', error: '' };
      if (delivery.value.mode === 'system') popup.value = null;
      today.value = value.today;
      setVisibleItems(value.items);
    }

    // Writes are serialized, while reads wait for the outstanding receipt writes.
    // Acknowledgement snapshots cannot overwrite a newer record revision.
    function acknowledge(selected, flags) {
      if (!available.value || disposed || !selected.length) return Promise.resolve(false);
      const source = generation.value;
      const requested = selected.map(notificationReference);
      pendingWrites.value++;
      const operation = queue.then(async () => {
        if (disposed || !available.value || generation.value !== source) return false;
        const key = keyFor();
        requests.invalidate();
        loading.value = false;
        requestError.value = '';
        try {
          const value = await app.withOperation(() => service.acknowledge({ generation: source, items: requested, ...flags }));
          if (!disposed && available.value && key === keyFor()) applySnapshot(value);
          return true;
        } catch (cause) {
          if (!disposed && available.value && key === keyFor()) {
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
      const fresh = pending.filter(item => !shown.has(notificationKey(item)));
      if (fresh.length) {
        for (const item of fresh) shown.add(notificationKey(item));
        popup.value = { items: [...(popup.value?.items ?? []), ...fresh] };
      }
      // Retry a failed receipt on the next refresh without presenting it again.
      const announced = pending.filter(item => shown.has(notificationKey(item)));
      if (announced.length && !popupWrite) {
        popupWrite = true;
        void acknowledge(announced, { popup: true }).finally(() => { popupWrite = false; });
      }
    }

    async function refresh() {
      await queue;
      if (disposed || !available.value) return false;
      const key = keyFor();
      const ticket = requests.issue(key);
      const source = generation.value;
      loading.value = true;
      requestError.value = '';
      try {
        const value = await requests.run(key, () => service.list({ generation: source }));
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
      requests.invalidate();
      loading.value = false;
      requestError.value = '';
      if (databaseChanged) { items.value = []; today.value = ''; popup.value = null; shown.clear(); delivery.value = { mode: 'in-app', error: '' }; }
      if (consumers && available.value) void refresh();
    }
    function resumeSystemOpen() {
      if (available.value && pendingSystemGeneration !== null) {
        const source = pendingSystemGeneration;
        pendingSystemGeneration = null;
        void openFromSystem({ generation: source });
      }
    }
    watch([generation, ready], () => {
      invalidate(true);
      resumeSystemOpen();
    }, { flush: 'sync' });
    watch(paused, () => {
      lockVersion++;
      invalidate();
      resumeSystemOpen();
    }, { flush: 'sync' });
    watch(() => app.revision, () => invalidate(), { flush: 'sync' });
    watch(() => app.planningEnabled, enabled => {
      if (!enabled) setVisibleItems(items.value);
    }, { flush: 'sync' });
    onScopeDispose(() => { disposed = true; requests.dispose(); shown.clear(); });

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
      if (disposed || !Number.isSafeInteger(source)) return false;
      if (paused.value || (!app.database && !app.initialized && !app.databaseSwitching)) {
        pendingSystemGeneration = source;
        return true;
      }
      if (!available.value || generation.value !== source) return false;
      await refresh();
      if (disposed || generation.value !== source) return false;
      if (paused.value) { pendingSystemGeneration = source; return true; }
      if (!available.value) return false;
      openRequest.value++;
      return true;
    }
    return { items, today, loading, error, popup, saving, unreadCount, openRequest, paused, refresh, acquire, markRead, markAllRead, dismissPopup, openFromSystem };
  });
}

export const useNotificationsStore = createNotificationsStore();
