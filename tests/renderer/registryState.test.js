import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, reactive } from 'vue';
import { createRegistryStore } from '../../src/renderer/stores/registryStore.js';
import { useRegistry } from '../../src/renderer/composables/useRegistry.js';

const record = (id, executor = 'Иванов') => ({ id, controlDate: '2026-10-23', incomingNumber: '001', instructionNumber: '0007', title: `Указание ${id}`, summary: '', deadline: '2026-10-26', executor, status: 'pending', executionMark: '', createdAt: '', updatedAt: '' });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture(t, overrides = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  t.after(() => disposePinia(pinia));
  const calls = [];
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false, pendingOperations: 0,
    touchData() { this.revision++; }, async withOperation(operation) { this.pendingOperations++; try { return await operation(); } finally { this.pendingOperations--; } } });
  const service = {
    list: async (request) => { calls.push(request); return { items: [record(1)], total: 120 }; },
    get: async ({ id }) => record(id), create: async ({ data }) => ({ ...data, id: 2 }),
    update: async ({ id, data }) => ({ ...data, id }), remove: async () => ({ removed: true }),
    export: async () => ({ cancelled: false, count: 120, filePath: 'C:/реестр.xlsx' }), ...overrides,
  };
  const useStore = createRegistryStore({ app, service });
  const store = useStore();
  return { pinia, useStore, app, service, store, calls };
}

test('registry query and results survive route scope disposal without a duplicate mount read', async (t) => {
  const { app, service, store, calls } = fixture(t);
  await store.ensureLoaded();
  store.draftFilters.executor = 'Петров';
  await store.applyFilters();
  await store.changeSort('deadline');
  await store.setPageSize(50);
  await store.setPage(2);
  const scope = effectScope();
  const first = scope.run(() => useRegistry(app, service));
  await nextTick();
  first.createRecord();
  scope.stop();
  app.touchData();
  await nextTick();
  await store.ensureLoaded();
  const before = calls.length;
  const secondScope = effectScope();
  const second = secondScope.run(() => useRegistry(app, service));
  t.after(() => secondScope.stop());
  await nextTick();
  assert.equal(second.selected.value, null);
  assert.equal(second.page.value, 2);
  assert.equal(second.appliedFilters.value.executor, 'Петров');
  assert.deepEqual(second.sort.value, { field: 'deadline', direction: 'asc' });
  assert.equal(second.items.value[0].id, 1);
  assert.equal(calls.length, before);
});

test('equal current reads share one pending IPC while a newer query defeats its late answer', async (t) => {
  const initial = deferred();
  const calls = [];
  const { store } = fixture(t, { list: (request) => {
    calls.push(request);
    return request.filters.executor ? Promise.resolve({ items: [record(2, 'Петров')], total: 1 }) : initial.promise;
  } });
  const first = store.refresh();
  const second = store.refresh();
  await nextTick();
  assert.equal(calls.length, 1);
  store.draftFilters.executor = 'Петров';
  await store.applyFilters();
  initial.resolve({ items: [record(1)], total: 99 });
  await Promise.all([first, second]);
  assert.equal(store.items[0].id, 2);
  assert.equal(store.total, 1);
  assert.equal(store.loading, false);
});

test('query A to B to A never reuses the now stale first A flight', async (t) => {
  const oldA = deferred();
  const newA = deferred();
  let aCalls = 0;
  const { store } = fixture(t, { list: ({ filters }) => filters.executor
    ? Promise.resolve({ items: [record(2)], total: 1 })
    : (++aCalls === 1 ? oldA.promise : newA.promise) });
  await nextTick();
  store.draftFilters.executor = 'Петров';
  await store.applyFilters();
  const final = store.resetFilters();
  await nextTick();
  assert.equal(aCalls, 2);
  newA.resolve({ items: [record(3)], total: 1 });
  await final;
  oldA.resolve({ items: [record(1)], total: 55 });
  await nextTick();
  assert.equal(store.items[0].id, 3);
});

test('generation and revision changes in one turn produce one fresh read and hide the late old error', async (t) => {
  const old = deferred();
  const calls = [];
  const { app, store } = fixture(t, { list: (request) => {
    calls.push(request);
    return request.generation === 1 ? old.promise : Promise.resolve({ items: [record(9)], total: 1 });
  } });
  await nextTick();
  app.database = { ready: true, generation: 2 };
  app.touchData();
  await nextTick();
  await store.ensureLoaded();
  assert.equal(calls.filter((request) => request.generation === 2).length, 1);
  old.reject(new Error('Ошибка прежней базы'));
  await nextTick();
  assert.equal(store.items[0].id, 9);
  assert.equal(store.error, '');
});

test('mutation revision starts one fresh read even if the old query is still pending', async (t) => {
  const old = deferred();
  const calls = [];
  const { app, store } = fixture(t, { list: (request) => {
    calls.push(request);
    return calls.length === 1 ? old.promise : Promise.resolve({ items: [record(7)], total: 1 });
  } });
  assert.equal(await store.saveRecord({ id: 7, data: record(7), generation: 1 }), true);
  await nextTick();
  assert.equal(app.revision, 1);
  assert.equal(calls.length, 2);
  old.resolve({ items: [record(1)], total: 99 });
  await nextTick();
  assert.equal(store.items[0].id, 7);
  assert.equal(app.pendingOperations, 0);
});
