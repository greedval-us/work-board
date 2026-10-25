import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { createAnalyticsStore } from '../../src/renderer/stores/analyticsStore.js';

test('analytics preserves applied filters and ignores a response from the previous database', async () => {
  setActivePinia(createPinia());
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0 });
  const pending = [];
  const store = createAnalyticsStore({ getApp: () => app, initialDate: () => '2026-10-26', service: { summary: request => new Promise(resolve => pending.push({ request, resolve })) } })();
  const first = store.refresh();
  await Promise.resolve();
  assert.equal(pending[0].request.filters.from, '2026-10-01');
  store.draftFilters.priority = 'important'; const filtered = store.applyFilters();
  await Promise.resolve();
  assert.equal(pending[1].request.filters.priority, 'important');
  app.database = { ready: true, generation: 2 };
  const next = store.refresh();
  await Promise.resolve();
  pending[2].resolve({ totals: { total: 2 } }); await next;
  pending[0].resolve({ totals: { total: 99 } }); await first;
  assert.equal(store.data.totals.total, 2);
  assert.equal(store.appliedFilters.priority, 'important');
  pending[1].resolve({ totals: { total: 1 } }); await filtered;
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
