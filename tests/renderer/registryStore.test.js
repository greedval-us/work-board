import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { nextTick, reactive, watch } from 'vue';
import { createRegistryStore } from '../../src/renderer/features/registry/state/registryStore.js';

function record(id) {
  return { id, controlDate: '2026-10-23', incomingNumber: '001', instructionNumber: '007-А', title: 'Доклад',
    summary: '', deadline: '2026-10-26', executor: 'Иванов', status: 'pending', executionMark: '',
    createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z' };
}

function setup(t, overrides = {}, now) {
  const pinia = createPinia();
  const app = reactive({
    database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    async withOperation(operation) { return operation(); },
    touchData() { this.revision += 1; },
  });
  const service = { list: async () => ({ items: [], total: 0 }), get: async ({ id }) => record(id),
    create: async ({ data }) => ({ ...record(1), ...data }), ...overrides };
  const store = createRegistryStore({ app, service, now })(pinia);
  t.after(() => disposePinia(pinia));
  return { app, store };
}

test('saving a record ignores obsolete attachment changes at the desktop boundary', async t => {
  let sent;
  const { store } = setup(t, { create: async ({ data }) => { sent = structuredClone(data); return { id: 1 }; } });
  const data = reactive({ ...record(1), attachments: { add: [{ token: 'selected', name: 'file.txt', size: 1 }], remove: [] } });
  assert.equal(await store.saveRecord({ data, generation: 1 }), true);
  assert.equal(sent.title, 'Доклад');
  assert.equal(Object.hasOwn(sent, 'attachments'), false);
});

test('a response queued before a new filter request cannot publish under that filter', async (t) => {
  const previous = Promise.withResolvers();
  const next = Promise.withResolvers();
  const { store } = setup(t, { list: ({ filters }) => filters.executor ? next.promise : previous.promise });
  await nextTick();
  assert.equal(store.loading, true);
  const transitions = [];
  const stop = watch(() => store.loading, (value) => transitions.push(value), { flush: 'sync' });
  t.after(stop);
  previous.resolve({ items: [record(1)], total: 1, documentTypes: ['Распоряжение'] });
  store.draftFilters.executor = 'Петров';
  const reading = store.applyFilters();
  await nextTick();
  assert.deepEqual(store.items, []);
  assert.deepEqual(store.documentTypes, []);
  assert.equal(store.loading, true);
  assert.equal(transitions.includes(false), false);
  next.resolve({ items: [{ ...record(2), executor: 'Петров' }], total: 1, documentTypes: ['Письмо', 'Приказ'] });
  await reading;
  assert.equal(store.items[0].id, 2);
  assert.deepEqual(store.documentTypes, ['Письмо', 'Приказ']);
  assert.equal(store.loading, false);
});

test('a queued previous card cannot resolve or stop loading after a newer card is requested', async (t) => {
  const previous = Promise.withResolvers();
  const next = Promise.withResolvers();
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
  const result = Promise.withResolvers();
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

test('closing control moves the saved record between the independently filtered registry views', async (t) => {
  const pinia = createPinia();
  t.after(() => disposePinia(pinia));
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    async withOperation(operation) { return operation(); }, touchData() { this.revision++; } });
  let saved = { ...record(1), closedAt: null };
  const service = {
    list: async ({ closed, filters }) => {
      const items = Boolean(closed) === Boolean(saved.closedAt)
        && (!filters.executor || filters.executor === saved.executor) ? [saved] : [];
      return { items, total: items.length };
    },
    async closeControl() { saved = { ...saved, closedAt: '2026-11-16T10:00:00.000Z' }; return saved; },
  };
  const registry = createRegistryStore({ app, service })(pinia);
  const archive = createRegistryStore({ app, service, closed: true })(pinia);
  registry.draftFilters.executor = 'Иванов';
  await Promise.all([registry.applyFilters(), archive.ensureLoaded()]);
  assert.equal(registry.total, 1);
  assert.deepEqual(archive.items, []);

  assert.equal(await registry.closeControl({ id: 1, generation: 1 }), true);
  await Promise.all([registry.ensureLoaded(), archive.ensureLoaded()]);
  assert.equal(registry.total, 0);
  assert.equal(archive.items[0].id, 1);
  assert.equal(archive.items[0].status, 'pending');
  assert.equal(archive.appliedFilters.executor, '');
});

test('an unsuccessful control closure leaves the registry usable and reports the action error', async (t) => {
  const { app, store } = setup(t, {
    list: async () => ({ items: [record(1)], total: 1 }),
    closeControl: async () => { throw new Error('private SQLite detail'); },
  });
  await store.ensureLoaded();

  assert.equal(await store.closeControl({ id: 1, generation: 1 }), false);
  assert.equal(store.items[0].id, 1);
  assert.equal(app.revision, 0);
  assert.match(store.error, /закрыть контроль/);
  assert.doesNotMatch(store.error, /SQLite/);
  assert.equal(store.canMutate, true);
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

test('returning to the initial filter and card in one turn only starts the final reads', async t => {
  const lists = [];
  const cards = [];
  const { store } = setup(t, {
    list: async ({ filters }) => {
      lists.push(filters.executor);
      return { items: [], total: 0 };
    },
    get: async ({ id }) => { cards.push(id); return record(id); },
  });
  store.draftFilters.executor = 'Петров';
  const filtered = store.applyFilters();
  const reset = store.resetFilters();
  const first = store.getRecord(1);
  const second = store.getRecord(2);
  const last = store.getRecord(1);

  assert.deepEqual(await Promise.all([filtered, reset, first, second, last]), [false, true, null, null, record(1)]);
  assert.deepEqual(lists, ['']);
  assert.deepEqual(cards, [1]);
});

test('a checkpoint filter resets to the first page when the local date changes', async (t) => {
  const previous = Promise.withResolvers();
  const next = Promise.withResolvers();
  const requests = [];
  let day = 26;
  const { store } = setup(t, { list: (request) => {
    requests.push(request);
    if (request.offset) return previous.promise;
    if (request.today === '2026-10-27') return next.promise;
    return { items: [record(1)], total: 100 };
  } }, () => new Date(2026, 9, day));

  store.draftFilters.checkpoint = 'today';
  await store.applyFilters();
  assert.equal(requests.at(-1).today, '2026-10-26');
  const stale = store.setPage(2);
  await nextTick();
  assert.equal(store.page, 2);

  day = 27;
  previous.resolve({ items: [record(2)], total: 100 });
  const updated = store.updateToday();
  assert.equal(store.page, 1);
  assert.equal(await stale, false);
  assert.equal(store.loading, true);
  assert.equal(store.items[0].id, 1);
  assert.equal(requests.at(-1).offset, 0);
  assert.equal(requests.at(-1).today, '2026-10-27');
  next.resolve({ items: [record(3)], total: 1 });
  assert.equal(await updated, true);
  assert.equal(store.items[0].id, 3);
});

test('returning to the registry refreshes a cached checkpoint list for the new local date', async (t) => {
  const dates = [];
  let day = 26;
  const { store } = setup(t, { list: async ({ today }) => {
    dates.push(today);
    return { items: [], total: 0 };
  } }, () => new Date(2026, 9, day));

  store.draftFilters.checkpoint = 'overdue';
  await store.applyFilters();
  await store.ensureLoaded();
  day = 27;
  await store.ensureLoaded();
  assert.deepEqual(dates, ['2026-10-26', '2026-10-27']);
  assert.equal(store.today, '2026-10-27');
});

test('export captures the current date for an active checkpoint filter', async (t) => {
  const exports = [];
  let day = 26;
  const { store } = setup(t, { export: async (request) => {
    exports.push(request);
    return { cancelled: false, count: 0 };
  } }, () => new Date(2026, 9, day));

  store.draftFilters.checkpoint = 'overdue';
  await store.applyFilters();
  day = 27;
  assert.equal(await store.exportRecords(), true);
  assert.equal(exports[0].filters.checkpoint, 'overdue');
  assert.equal(exports[0].today, '2026-10-27');
});

test('the short and full reports use the same applied filters and sort across all pages', async (t) => {
  const exports = [];
  const { store } = setup(t, {
    list: async () => ({ items: [], total: 34 }),
    export: async (request) => { exports.push(request); return { cancelled: false, count: 34 }; },
  });
  store.draftFilters.executor = 'Иванов';
  store.draftFilters.documentType = 'Приказ';
  await store.applyFilters();
  await store.changeSort('documentType');
  await store.changeSort('documentType');
  await store.setPage(2);
  store.draftFilters.executor = 'Петров';

  assert.equal(await store.exportRecords('full'), true);
  assert.equal(await store.exportRecords('short'), true);
  const [full, { reportType, ...short }] = exports;
  assert.equal(reportType, 'short');
  assert.deepEqual(short, full);
  assert.equal(full.filters.executor, 'Иванов');
  assert.equal(full.filters.documentType, 'Приказ');
  assert.deepEqual(full.sort, { field: 'documentType', direction: 'desc' });
  assert.equal(full.offset, undefined);
  assert.equal(full.limit, undefined);
});

test('an Excel launch failure keeps the saved export successful and its path available', async (t) => {
  const filePath = 'C:/Отчёты/Реестр.xlsx';
  let result = { cancelled: false, count: 2, filePath, opened: false };
  const { store } = setup(t, { export: async () => result });

  assert.equal(await store.exportRecords(), true);
  assert.equal(store.notice, 'Выгружено записей: 2.');
  assert.equal(store.unopenedExportPath, filePath);
  assert.equal(store.error, '');

  result = { cancelled: true };
  assert.equal(await store.exportRecords(), false);
  assert.equal(store.notice, 'Выгрузка отменена.');
  assert.equal(store.unopenedExportPath, null);
});

test('an unfiltered date change updates display state and reuses the cached list', async (t) => {
  const requests = [];
  let day = 26;
  const { store } = setup(t, {
    list: async (request) => { requests.push(request); return { items: [], total: 0 }; },
    export: async (request) => { requests.push(request); return { cancelled: false, count: 0 }; },
  }, () => new Date(2026, 9, day));
  await store.ensureLoaded();
  store.draftFilters.checkpoint = 'today';
  day = 27;

  await store.updateToday();
  await store.ensureLoaded();
  assert.equal(store.today, '2026-10-27');
  assert.equal(requests.length, 1);
  await store.exportRecords();
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => !Object.hasOwn(request, 'today')));
});

test('a failed registry refresh retains its displayed rows and ensureLoaded retries the failed snapshot', async t => {
  let calls = 0;
  const { store } = setup(t, { list: () => {
    calls++;
    if (calls === 2) throw new Error('private SQLite detail');
    return { items: [record(calls)], total: 1 };
  } });
  await store.ensureLoaded();
  assert.equal(await store.refresh(), false);
  assert.equal(store.items[0].id, 1);
  assert.equal(store.total, 1);
  assert.equal(store.loading, false);
  assert.match(store.error, /реестр/);
  assert.doesNotMatch(store.error, /SQLite/);
  assert.equal((await store.getRecord(1)).id, 1);
  assert.equal(store.error, '', 'opening a card clears visible feedback');
  assert.equal(await store.ensureLoaded(), true);
  assert.equal(calls, 3);
  assert.equal(store.items[0].id, 3);
  assert.equal(store.error, '');
});
