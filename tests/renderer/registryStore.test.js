import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick, reactive, watch } from 'vue';
import { createRegistryStore } from '../../src/renderer/stores/registryStore.js';

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function record(id) {
  return { id, controlDate: '2026-10-23', incomingNumber: '001', instructionNumber: '007-А', title: 'Доклад',
    summary: '', deadline: '2026-10-26', executor: 'Иванов', status: 'pending', executionMark: '',
    createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z' };
}

function setup(t, overrides = {}) {
  const pinia = createPinia();
  const app = reactive({
    database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    async withOperation(operation) { return operation(); },
    touchData() { this.revision += 1; },
  });
  const service = { list: async () => ({ items: [], total: 0 }), get: async ({ id }) => record(id),
    create: async ({ data }) => ({ ...record(1), ...data }), ...overrides };
  const store = createRegistryStore({ app, service })(pinia);
  t.after(() => disposePinia(pinia));
  return { app, store };
}

test('a response queued before a new filter request cannot publish under that filter', async (t) => {
  const previous = deferred();
  const next = deferred();
  const { store } = setup(t, { list: ({ filters }) => filters.executor ? next.promise : previous.promise });
  await nextTick();
  assert.equal(store.loading, true);
  const transitions = [];
  const stop = watch(() => store.loading, (value) => transitions.push(value), { flush: 'sync' });
  t.after(stop);
  previous.resolve({ items: [record(1)], total: 1 });
  store.draftFilters.executor = 'Петров';
  const reading = store.applyFilters();
  await nextTick();
  assert.deepEqual(store.items, []);
  assert.equal(store.loading, true);
  assert.equal(transitions.includes(false), false);
  next.resolve({ items: [{ ...record(2), executor: 'Петров' }], total: 1 });
  await reading;
  assert.equal(store.items[0].id, 2);
  assert.equal(store.loading, false);
});

test('a queued previous card cannot resolve or stop loading after a newer card is requested', async (t) => {
  const previous = deferred();
  const next = deferred();
  const { store } = setup(t, { get: ({ id }) => id === 1 ? previous.promise : next.promise });
  const first = store.getRecord(1);
  await nextTick();
  assert.equal(store.opening, true);
  const transitions = [];
  const stop = watch(() => store.opening, (value) => transitions.push(value), { flush: 'sync' });
  t.after(stop);
  previous.resolve(record(1));
  const second = store.getRecord(2);
  assert.equal(await first, null);
  assert.equal(store.opening, true);
  assert.equal(transitions.includes(false), false);
  next.resolve(record(2));
  assert.equal((await second).id, 2);
  assert.equal(store.opening, false);
});

test('a list snapshot is available to navigation before the pending flight is released', async (t) => {
  const result = deferred();
  let calls = 0;
  const { store } = setup(t, { list: () => { calls++; return result.promise; } });
  const first = store.ensureLoaded();
  await nextTick();
  result.resolve({ items: [record(3)], total: 1 });
  let returning;
  queueMicrotask(() => { returning = store.ensureLoaded(); });
  await first;
  await returning;
  assert.equal(calls, 1);
  assert.equal(store.items[0].id, 3);
});

test('saving an instruction and returning to the list refreshes that revision once', async (t) => {
  let calls = 0;
  const { store, app } = setup(t, { list: async () => { calls++; return { items: [record(calls)], total: 1 }; } });
  await store.ensureLoaded();
  assert.equal(await store.saveRecord({ data: record(1), generation: 1 }), true);
  await store.ensureLoaded();
  assert.equal(app.revision, 1);
  assert.equal(calls, 2);
  assert.equal(store.items[0].id, 2);
});

test('queries superseded before their queued work starts do not issue obsolete IPC reads', async (t) => {
  const executors = [];
  const { store } = setup(t, { list: async ({ filters }) => {
    executors.push(filters.executor);
    return { items: [record(5)], total: 1 };
  } });
  store.draftFilters.executor = 'Иванов';
  const first = store.applyFilters();
  store.draftFilters.executor = 'Петров';
  const second = store.applyFilters();
  await Promise.all([first, second]);
  assert.deepEqual(executors, ['Петров']);
  assert.equal(store.items[0].id, 5);
  assert.equal(store.loading, false);
});
