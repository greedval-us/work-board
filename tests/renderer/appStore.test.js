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
