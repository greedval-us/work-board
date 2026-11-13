import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { createAnalyticsStore } from '../../src/renderer/stores/analyticsStore.js';

test('analytics clears the executor and ignores replies from the previous database', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const pending = [];
  const store = createAnalyticsStore({ getApp: () => app, initialDate: () => '2026-10-26', service: { summary: request => new Promise(resolve => pending.push({ request, resolve })) } })();
  const first = store.refresh();
  await Promise.resolve();
  assert.equal(pending[0].request.filters.from, '2026-10-01');
  store.draftFilters.executor = 'иванов'; const filtered = store.applyFilters();
  await Promise.resolve();
  assert.deepEqual(pending[1].request.filters, {
    from: '2026-10-01', to: '2026-10-26', status: '', executor: 'иванов',
  });
  app.database = { ready: true, generation: 2 };
  const next = store.refresh();
  await Promise.resolve();
  assert.equal(pending[2].request.generation, 2);
  assert.equal(pending[2].request.filters.executor, '');
  const executorOptions = [{ key: 'петров', label: 'Петров' }];
  pending[2].resolve({ totals: { total: 2 }, executorOptions }); await next;
  pending[0].resolve({ totals: { total: 99 }, executorOptions: [{ key: 'иванов', label: 'Иванов' }] }); await first;
  assert.equal(store.data.totals.total, 2);
  assert.equal(store.appliedFilters.executor, '');
  assert.equal(store.draftFilters.executor, '');
  assert.deepEqual(store.executorOptions, executorOptions);
  pending[1].resolve({ totals: { total: 1 } }); await filtered;
  assert.equal(store.data.totals.total, 2);
  store.$dispose();
});

test('analytics rejects an inverted period before IPC and handles empty results', async () => {
  setActivePinia(createPinia()); let calls = 0;
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const store = createAnalyticsStore({ getApp: () => app, service: { summary: async () => { calls++; return { totals: { total: 0 } }; } } })();
  store.draftFilters.from = '2026-10-26'; store.draftFilters.to = '2026-10-01';
  assert.equal(await store.applyFilters(), false); assert.equal(calls, 0); assert.match(store.filterError, /период/i);
  await store.resetFilters(); assert.equal(calls, 1); assert.equal(store.data.totals.total, 0);
  store.$dispose();
});

test('returning to an already pending selection accepts its shared response', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 }); const pending = [];
  const store = createAnalyticsStore({ getApp: () => app, service: { summary: request => new Promise(resolve => pending.push({ request, resolve })) } })();
  const first = store.refresh(); await Promise.resolve();
  store.draftFilters.status = 'completed'; const second = store.applyFilters(); await Promise.resolve();
  store.draftFilters.status = ''; const returned = store.applyFilters(); await Promise.resolve();
  assert.equal(pending.length, 2);
  pending[0].resolve({ totals: { total: 5 } }); await Promise.all([first, returned]);
  assert.equal(store.data?.totals.total, 5); assert.equal(store.loading, false);
  pending[1].resolve({ totals: { total: 2 } }); await second;
  assert.equal(store.data.totals.total, 5); store.$dispose();
});

test('selecting an executor applies its exact key while retaining other unapplied filters and historical choices', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const pending = [];
  const store = createAnalyticsStore({
    getApp: () => app,
    initialDate: () => '2026-10-26',
    service: { summary: request => new Promise(resolve => pending.push({ request, resolve })) },
  })();
  const initial = store.refresh();
  await Promise.resolve();
  const executorOptions = [{ key: 'иванов ', label: 'Иванов ' }, { key: 'иванова', label: 'Иванова' }];
  pending[0].resolve({ totals: { total: 3 }, executorOptions, instructions: null });
  await initial;

  Object.assign(store.draftFilters, { from: '2026-10-27', to: '2026-10-10', status: 'invalid' });
  assert.equal(await store.applyFilters(), false);
  const selected = store.selectExecutor('иванов ');
  await Promise.resolve();
  assert.deepEqual(pending[1].request, {
    filters: { from: '2026-10-01', to: '2026-10-26', status: '', executor: 'иванов ' },
    generation: 1,
    page: 1,
  });
  assert.deepEqual(store.draftFilters, { from: '2026-10-27', to: '2026-10-10', status: 'invalid', executor: 'иванов ' });
  assert.deepEqual(store.executorOptions, executorOptions);
  assert.equal(store.filtersChanged, true);
  pending[1].resolve({ totals: { total: 1 }, executorOptions, instructions: { items: [{ id: 1 }], page: 1, pageCount: 1 } });
  assert.equal(await selected, true);
  assert.equal(store.appliedFilters.executor, 'иванов ');
  store.$dispose();
});

test('paging uses applied filters, retains displayed results during loading, and ignores an older page', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const pending = [];
  const store = createAnalyticsStore({
    getApp: () => app,
    initialDate: () => '2026-10-26',
    service: { summary: request => new Promise(resolve => pending.push({ request, resolve })) },
  })();
  const selected = store.selectExecutor('иванов');
  await Promise.resolve();
  const result = page => ({
    totals: { total: 53 },
    executorOptions: [{ key: 'иванов', label: 'Иванов' }],
    instructions: { items: [{ id: page }], page, pageCount: 3 },
  });
  pending[0].resolve(result(1));
  await selected;

  store.draftFilters.status = 'completed';
  const second = store.setPage(2);
  await Promise.resolve();
  assert.equal(store.data.instructions.page, 1);
  assert.equal(store.loading, true);
  const third = store.setPage(3);
  await Promise.resolve();
  assert.deepEqual(pending.slice(1).map(({ request }) => [request.page, request.filters.status, request.filters.executor]), [
    [2, '', 'иванов'], [3, '', 'иванов'],
  ]);
  pending[2].resolve(result(3));
  assert.equal(await third, true);
  pending[1].resolve(result(2));
  assert.equal(await second, false);
  assert.equal(store.data.instructions.page, 3);
  assert.equal(store.draftFilters.status, 'completed');

  const applied = store.applyFilters();
  await Promise.resolve();
  assert.equal(pending[3].request.page, 1);
  assert.equal(pending[3].request.filters.status, 'completed');
  pending[3].resolve(result(1));
  await applied;
  store.$dispose();
});

test('revisions keep the selected executor and page, while database readiness clears them', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const requests = [];
  const executorOptions = [{ key: 'иванов', label: 'Иванов' }];
  let pageCount = 3;
  const store = createAnalyticsStore({
    getApp: () => app,
    service: { summary: async request => {
      requests.push(request);
      const instructions = request.filters.executor ? { items: [], page: Math.min(request.page, pageCount), pageCount } : null;
      return { totals: { total: 0 }, executorOptions, instructions };
    } },
  })();
  await store.selectExecutor('иванов');
  await store.setPage(3);
  pageCount = 2;
  app.revision++;
  assert.deepEqual(store.executorOptions, executorOptions);
  await store.refresh();
  assert.equal(requests.at(-1).filters.executor, 'иванов');
  assert.equal(requests.at(-1).page, 3);
  assert.equal(store.data.instructions.page, 2);
  assert.equal(store.loading, false);
  await store.refresh({ force: true });
  assert.equal(requests.at(-1).page, 2);

  await store.selectExecutor('');
  assert.equal(requests.at(-1).page, 1);
  assert.equal(store.data.instructions, null);
  await store.selectExecutor('иванов');
  await store.setPage(2);
  app.database.ready = false;
  assert.deepEqual(store.executorOptions, []);
  assert.equal(store.appliedFilters.executor, '');
  app.database.ready = true;
  await store.refresh();
  assert.equal(requests.at(-1).filters.executor, '');
  assert.equal(requests.at(-1).page, 1);
  store.$dispose();
});

test('concurrent forced analytics reads share work while only the latest caller publishes the result', async t => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  let resolve;
  let calls = 0;
  const pending = new Promise(done => { resolve = done; });
  const store = createAnalyticsStore({ getApp: () => app, service: {
    summary: () => ++calls === 1 ? { totals: { total: 1 } } : pending,
  } })();
  t.after(() => store.$dispose());
  await store.refresh();
  const first = store.refresh({ force: true, keepData: true });
  const second = store.refresh({ force: true, keepData: true });
  await Promise.resolve();
  assert.equal(calls, 2);
  assert.equal(store.data.totals.total, 1);
  assert.equal(store.loading, true);
  resolve({ totals: { total: 2 } });
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(store.data.totals.total, 2);
  assert.equal(store.loading, false);
  await store.refresh();
  assert.equal(calls, 2);
});
