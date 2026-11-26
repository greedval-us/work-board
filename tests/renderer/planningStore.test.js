import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { groupPlans } from '../../src/renderer/features/planning/groupPlans.js';
import { createPlanningStore } from '../../src/renderer/features/planning/planningStore.js';

function setup(t, service, { enabled = true, closed = false } = {}) {
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const app = reactive({
    database: { ready: true, generation: 1 }, planningEnabled: enabled, revision: 0,
    withOperation: run => run(), touchData() { this.revision++; },
  });
  return { app, store: createPlanningStore({ app, service, closed })(pinia) };
}

test('the plan editor creates its whole batch in one call and updates a selected row by ID', async t => {
  const calls = [];
  const { app, store } = setup(t, {
    list: async () => ({ items: [], total: 0 }),
    create: async request => calls.push(['create', request]),
    update: async request => calls.push(['update', request]),
  });
  const rows = [
    { instructionNumber: 'П-1', planItem: 'Подготовить', executor: 'Иванов' },
    { instructionNumber: 'П-1', planItem: 'Проверить', executor: 'Петров' },
  ];
  assert.equal(await store.saveRecord({ data: rows, generation: 1 }), true);
  assert.equal(await store.saveRecord({ id: 9, data: [rows[1]], generation: 1 }), true);
  assert.deepEqual(calls, [
    ['create', { rows, generation: 1 }],
    ['update', { id: 9, data: rows[1], generation: 1 }],
  ]);
  assert.equal(app.revision, 2);
});

test('planning loads only enabled databases and discards late results from the previous database', async t => {
  const old = Promise.withResolvers();
  const calls = [];
  const { app, store } = setup(t, { list: async request => {
    calls.push(request);
    return request.generation === 1 ? old.promise : { items: [{ id: 2 }], total: 1 };
  } }, { enabled: false });

  await store.ensureLoaded();
  assert.deepEqual(calls, []);
  app.planningEnabled = true;
  const pending = store.ensureLoaded();
  await nextTick();
  assert.equal(calls.length, 1);
  app.database = { ready: true, generation: 2 };
  await store.ensureLoaded();
  old.resolve({ items: [{ id: 1 }], total: 100 });
  await pending;
  assert.deepEqual(store.items, [{ id: 2 }]);
  app.planningEnabled = false;
  app.touchData();
  await store.ensureLoaded();
  assert.deepEqual(store.items, []);
  assert.equal(calls.length, 2);
});

test('closed plan pages use group totals and allow sorting and exporting by plan item', async t => {
  const reads = [], exports = [];
  const { store } = setup(t, {
    list: async request => { reads.push(request); return { items: [], total: 26 }; },
    export: async request => { exports.push(request); return { cancelled: false, count: 120 }; },
  }, { closed: true });

  await store.ensureLoaded();
  await store.changeSort('planItem');
  await store.setPage(2);
  assert.equal(store.pageCount, 2);
  assert.equal(reads.at(-1).offset, 25);
  assert.equal(reads.at(-1).closed, true);
  await store.exportRecords('short');
  assert.deepEqual(exports[0].sort, { field: 'planItem', direction: 'asc' });
  assert.equal(exports[0].closed, true);
  assert.equal(exports[0].limit, undefined);
});

test('a closed planning view with no filter matches can export all open overdue controls', async t => {
  const exports = [];
  const { store } = setup(t, {
    list: async () => ({ items: [], total: 0 }),
    export: async request => { exports.push(request); return { cancelled: false, count: 4 }; },
  }, { closed: true });
  store.draftFilters.instructionNumber = 'нет совпадений';
  await store.applyFilters();
  assert.equal(store.total, 0);
  assert.equal(await store.exportRecords('overdue'), true);
  assert.deepEqual(exports, [{ reportType: 'overdue', generation: 1 }]);
  assert.equal(store.appliedFilters.instructionNumber, 'нет совпадений');
});

test('plan groups preserve server order and use case-insensitive normalized subscription numbers', () => {
  const rows = [
    { id: 5, instructionNumber: 'П-１' }, { id: 2, instructionNumber: 'п-1' }, { id: 3, instructionNumber: 'А-2' },
  ];
  assert.deepEqual(groupPlans(rows), [
    { key: 'п-1', rows: [rows[0], rows[1]] }, { key: 'а-2', rows: [rows[2]] },
  ]);
});
