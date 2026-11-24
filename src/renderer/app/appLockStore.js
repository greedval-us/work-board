import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { createDesktopService } from '../infrastructure/desktopApi.js';
import { errorMessage } from '../infrastructure/errorMessage.js';

const service = createDesktopService({
  getStatus: ['appLock', 'getStatus'],
  configure: ['appLock', 'configure'],
  unlock: ['appLock', 'unlock'],
  lock: ['appLock', 'lock'],
  hasPendingNotifications: ['appLock', 'hasPendingNotifications'],
});

export const useAppLockStore = defineStore('appLock', () => {
  const status = shallowRef(null);
  const loading = shallowRef(false);
  const error = shallowRef('');
  const blocked = computed(() => status.value?.locked !== false);
  let revision = 0;

  function subscribe() {
    return globalThis.window?.desktopAPI?.appLock?.onStatusChanged?.(value => {
      revision++;
      status.value = value;
      error.value = '';
    });
  }

  async function update(operation) {
    const requestedAt = revision;
    const value = await operation();
    if (revision === requestedAt) status.value = value;
  }

  async function initialize() {
    if (loading.value) return;
    loading.value = true;
    error.value = '';
    try { await update(service.getStatus); }
    catch (cause) { if (!status.value) error.value = errorMessage(cause, 'Не удалось проверить блокировку приложения.'); }
    finally { loading.value = false; }
  }

  return {
    status, blocked, loading, error, subscribe, initialize,
    configure: payload => update(() => service.configure(payload)),
    unlock: password => update(() => service.unlock({ password })),
    lock: () => update(service.lock),
    hasPendingNotifications: service.hasPendingNotifications,
  };
});
