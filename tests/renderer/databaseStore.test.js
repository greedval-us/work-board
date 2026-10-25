import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../../src/renderer/stores/appStore.js';
import { transportFixture } from '../helpers/desktopTransport.js';

function setup(t) {
  const previous = globalThis.window;
  let status = { ready: false, generation: 0 };
  globalThis.window = { desktopAPI: transportFixture({
    app: { getInfo: async () => ({ name: 'Work Board' }) },
    database: {
      getStatus: async () => status,
      create: async () => ({ cancelled: false, status: status = { ready: true, generation: 1 } }),
      open: async () => ({ cancelled: true, status }),
    },
    settings: { get: async () => ({ theme: 'dark' }) },
  }) };
  setActivePinia(createPinia());
  t.after(() => { globalThis.window = previous; });
  return useAppStore();
}

test('first-run initializes without a DB and successful selection refreshes generation and theme', async (t) => {
  const app = setup(t);
  await app.initialize();
  assert.equal(app.initialized, true);
  assert.equal(app.database.ready, false);
  assert.equal(await app.selectDatabase('create'), true);
  assert.equal(app.database.generation, 1);
  assert.equal(app.theme, 'dark');
  assert.ok(app.revision > 0);
});

test('cancelled unsaved guard and pending mutation prevent switching', async (t) => {
  const app = setup(t);
  await app.initialize();
  const unregister = app.registerUnsavedGuard(async () => false);
  assert.equal(await app.selectDatabase('create'), false);
  assert.equal(app.database.ready, false);
  unregister();
  await app.withOperation(async () => {
    assert.equal(app.pendingOperations, 1);
    assert.equal(await app.selectDatabase('create'), false);
  });
  assert.equal(app.pendingOperations, 0);
  assert.equal(app.database.ready, false);
});

test('cancelled database dialog preserves the current data generation', async (t) => {
  const app = setup(t);
  await app.initialize();
  await app.selectDatabase('create');
  const generation = app.database.generation;
  assert.equal(await app.selectDatabase('open'), false);
  assert.equal(app.database.generation, generation);
  assert.equal(app.databaseSwitching, false);
});
