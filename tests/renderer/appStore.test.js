import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../../src/renderer/stores/appStore.js';
import { transportFixture } from '../helpers/desktopTransport.js';

function bridge(t, overrides = {}) {
  const previous = globalThis.window;
  let theme = 'light';
  globalThis.window = { desktopAPI: transportFixture({
    app: { getInfo: async () => ({ name: 'Work Board', version: '0.1.0' }) },
    database: { getStatus: async () => ({ ready: true, schemaVersion: 1 }) },
    settings: { get: async () => ({ theme }), setTheme: async (value) => ({ theme: theme = value }) },
    ...overrides,
  }) };
  setActivePinia(createPinia());
  t.after(() => { globalThis.window = previous; });
  return useAppStore();
}

test('bootstrap loads real bridge results and clears loading state', async (t) => {
  const store = bridge(t);
  await store.initialize();
  assert.equal(store.info.name, 'Work Board');
  assert.equal(store.database.ready, true);
  assert.equal(store.theme, 'light');
  assert.equal(store.loading, false);
  assert.equal(store.error, '');
});

test('theme changes only after persistence succeeds', async (t) => {
  const store = bridge(t, { settings: {
    get: async () => ({ theme: 'light' }),
    setTheme: async () => { throw new Error('Хранилище недоступно'); },
  } });
  await store.initialize();
  await store.setTheme('dark');
  assert.equal(store.theme, 'light');
  assert.equal(store.saving, false);
  assert.match(store.error, /Связь с приложением недоступна/);
  assert.doesNotMatch(store.error, /Хранилище недоступно/);
});

test('registry and Ф‑21 options load for the active database and refresh after each saved change', async (t) => {
  const first = { source: ['Канцелярия'], executor: [], department: ['Отдел кадров'], executorPhone: ['+7 900 100-20-30'] };
  const second = { source: [], executor: ['Иванов'], department: ['Архив'], executorPhone: [] };
  const oldPhone = '+7 900 123-45-67';
  const newPhone = '+7 900 765-43-21';
  const store = bridge(t, {
    database: {
      getStatus: async () => ({ ready: true, generation: 1 }),
      open: async () => ({ cancelled: false, status: { ready: true, generation: 2 } }),
    },
    settings: {
      get: async (generation) => ({ theme: 'light', registryOptions: generation === 1 ? first : second }),
      addRegistryOption: async (field, value, generation) => {
        assert.deepEqual([field, value, generation], ['executorPhone', oldPhone, 2]);
        return { theme: 'light', registryOptions: { ...second, executorPhone: [value] } };
      },
      updateRegistryOption: async (field, previousValue, value, generation) => {
        assert.deepEqual([field, previousValue, value, generation], ['executorPhone', oldPhone, newPhone, 2]);
        return { theme: 'light', registryOptions: { ...second, executorPhone: [value] } };
      },
      removeRegistryOption: async (field, value, generation) => {
        if (value === 'Удалённый вариант') throw new Error('Вариант не найден');
        assert.deepEqual([field, value, generation], ['executorPhone', newPhone, 2]);
        return { theme: 'light', registryOptions: second };
      },
    },
  });
  await store.initialize();
  assert.deepEqual(store.registryOptions, first);
  await store.selectDatabase('open');
  assert.deepEqual(store.registryOptions, second);
  assert.equal(await store.addRegistryOption('executorPhone', oldPhone), true);
  assert.deepEqual(store.registryOptions, { ...second, executorPhone: [oldPhone] });
  assert.equal(await store.updateRegistryOption('executorPhone', oldPhone, newPhone), true);
  assert.deepEqual(store.registryOptions, { ...second, executorPhone: [newPhone] });
  assert.equal(await store.removeRegistryOption('executorPhone', 'Удалённый вариант'), false);
  assert.match(store.registryOptionsError, /Связь с приложением недоступна/);
  assert.equal(store.error, '');
  assert.deepEqual(store.registryOptions, { ...second, executorPhone: [newPhone] });
  assert.equal(await store.removeRegistryOption('executorPhone', newPhone), true);
  assert.deepEqual(store.registryOptions, second);
  assert.equal(store.registryOptionsError, '');
});

test('adding and editing an executor send contacts in the same settings request', async (t) => {
  const first = { department: 'Архив', executorPhone: '123' };
  const updated = { department: '', executorPhone: '456' };
  const calls = [];
  const store = bridge(t, {
    database: { getStatus: async () => ({ ready: true, generation: 4 }) },
    settings: {
      get: async () => ({ theme: 'light' }),
      addRegistryOption: async (...args) => {
        calls.push(['add', ...args]);
        return { theme: 'light', executorContacts: [{ executor: 'Иванов', ...first }] };
      },
      updateRegistryOption: async (...args) => {
        calls.push(['update', ...args]);
        return { theme: 'light', executorContacts: [{ executor: 'Иванов', ...updated }] };
      },
    },
  });
  await store.initialize();
  assert.equal(await store.addRegistryOption('executor', 'Иванов', first), true);
  assert.equal(await store.updateRegistryOption('executor', 'Иванов', 'Иванов', updated), true);
  assert.deepEqual(calls, [
    ['add', 'executor', 'Иванов', 4, first],
    ['update', 'executor', 'Иванов', 'Иванов', 4, updated],
  ]);
  assert.deepEqual(store.executorContacts, [{ executor: 'Иванов', ...updated }]);
});

test('executor contacts load per database and update only after a successful save', async (t) => {
  const first = [{ executor: 'Иванов', department: 'Архив', executorPhone: '123' }];
  const store = bridge(t, {
    database: {
      getStatus: async () => ({ ready: true, generation: 1 }),
      open: async () => ({ cancelled: false, status: { ready: true, generation: 2 } }),
    },
    settings: {
      get: async (generation) => ({ theme: 'light', executorContacts: generation === 1 ? first : [] }),
      setExecutorContact: async (executor, contact, generation) => {
        assert.deepEqual([executor, generation], ['Иванов', 2]);
        if (contact.executorPhone === '999') throw new Error('Вариант не найден');
        return {
          theme: 'light',
          executorContacts: contact.department || contact.executorPhone ? [{ executor, ...contact }] : [],
        };
      },
    },
  });

  await store.initialize();
  assert.deepEqual(store.executorContacts, first);
  await store.selectDatabase('open');
  assert.deepEqual(store.executorContacts, []);
  const saved = { department: '', executorPhone: '456' };
  assert.equal(await store.setExecutorContact('Иванов', saved), true);
  assert.deepEqual(store.executorContacts, [{ executor: 'Иванов', ...saved }]);
  assert.equal(await store.setExecutorContact('Иванов', { ...saved, executorPhone: '999' }), false);
  assert.match(store.executorContactsError, /Связь с приложением недоступна/);
  assert.deepEqual(store.executorContacts, [{ executor: 'Иванов', ...saved }]);
  assert.equal(await store.setExecutorContact('Иванов', { department: '', executorPhone: '' }), true);
  assert.deepEqual(store.executorContacts, []);
  assert.equal(store.executorContactsError, '');
});

test('concurrent bootstrap callers share pending work and await initialized state', async (t) => {
  let calls = 0;
  let finish;
  const result = new Promise(resolve => { finish = resolve; });
  const store = bridge(t, { app: { getInfo: () => { calls++; return result; } } });
  const first = store.initialize();
  const second = store.initialize();
  assert.equal(store.initialized, false);
  finish({ name: 'Work Board' });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(store.initialized, true);
});

test('failed mutations release pending operation guards', async (t) => {
  const store = bridge(t);
  await assert.rejects(store.withOperation(() => { throw new Error('failure'); }));
  assert.equal(store.pendingOperations, 0);
});

test('missing desktop bridge reports an error instead of fake success', async (t) => {
  const store = bridge(t);
  delete globalThis.window.desktopAPI;
  await store.initialize();
  assert.equal(store.database, null);
  assert.equal(store.loading, false);
  assert.match(store.error, /Electron/);
});
