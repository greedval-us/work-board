import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, nextTick, reactive } from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { DesktopError } from '../../src/shared/errors.js';
import { useRegistry } from '../../src/renderer/composables/useRegistry.js';

const row = (id = 1) => ({
  id, controlDate: '2026-10-23', incomingNumber: '001/в', instructionNumber: '0007-А',
  title: 'Проверить сведения', summary: 'Полный текст', deadline: '2026-10-26',
  executor: 'Иванов', status: 'pending', executionMark: '',
  createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z',
});

function setup(t, overrides = {}, ready = true) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const requests = [];
  const previous = globalThis.window;
  globalThis.window = { desktopAPI: { instructions: {
    list: async (request) => { requests.push(['list', request]); return { items: [row()], total: 1 }; },
    get: async (request) => { requests.push(['get', request]); return row(request.id); },
    create: async (request) => { requests.push(['create', request]); return { ...row(), ...request.data }; },
    update: async (request) => { requests.push(['update', request]); return { ...row(request.id), ...request.data }; },
    remove: async (request) => { requests.push(['remove', request]); return { removed: true }; },
    export: async (request) => { requests.push(['export', request]); return { cancelled: false, filePath: 'C:/Указания.xlsx', count: 43 }; },
    ...overrides,
  } } };
  const app = reactive({
    database: { ready, generation: 1, message: '' }, revision: 0, pendingOperations: 0,
    databaseSwitching: false,
    touchData() { this.revision += 1; },
    async withOperation(fn) { this.pendingOperations += 1; try { return await fn(); } finally { this.pendingOperations -= 1; } },
  });
  const scope = effectScope();
  const state = scope.run(() => useRegistry(app, globalThis.window.desktopAPI.instructions));
  t.after(() => { scope.stop(); disposePinia(pinia); globalThis.window = previous; });
  return { app, state, requests };
}

test('draft filters do not change displayed results or export until Apply', async (t) => {
  const { state, requests } = setup(t);
  await nextTick();
  state.draftFilters.executor = '  ПЕТРОВ  ';
  state.draftFilters.deadlineFrom = '2026-10-01';
  assert.equal(requests.filter(([type]) => type === 'list').length, 1);
  await state.exportRecords();
  assert.equal(requests.find(([type]) => type === 'export')[1].filters.executor, '');
  assert.equal(state.notice.value, 'Выгружено записей: 43.');
  await state.applyFilters();
  const applied = requests.filter(([type]) => type === 'list').at(-1)[1];
  assert.equal(applied.filters.executor, 'ПЕТРОВ');
  assert.equal(applied.filters.deadlineFrom, '2026-10-01');
  assert.equal(applied.offset, 0);
  assert.equal(state.filtersChanged.value, false);
  await state.exportRecords();
  const exported = requests.filter(([type]) => type === 'export').at(-1)[1];
  assert.equal(exported.filters.executor, 'ПЕТРОВ');
  assert.equal('limit' in exported, false);
  await state.resetFilters();
  assert.equal(state.draftFilters.executor, '');
  assert.equal(state.appliedFilters.value.executor, '');
});

test('inverted date filter is rejected without replacing applied filters', async (t) => {
  const { state, requests } = setup(t);
  await nextTick();
  state.draftFilters.deadlineFrom = '2026-11-02';
  state.draftFilters.deadlineTo = '2026-10-01';
  assert.equal(await state.applyFilters(), false);
  assert.equal(requests.length, 1);
  assert.match(state.filterError.value, /позже/);
  assert.equal(state.appliedFilters.value.deadlineFrom, '');
});

test('a late read from the previous database cannot replace the new database results', async (t) => {
  let finishOld;
  const { app, state } = setup(t, { list: (request) => request.generation === 1
    ? new Promise((resolve) => { finishOld = resolve; })
    : Promise.resolve({ items: [row(22)], total: 1 }) });
  await nextTick();
  app.database = { ready: true, generation: 2 };
  await state.refresh();
  assert.equal(state.items.value[0].id, 22);
  finishOld({ items: [row(11)], total: 99 });
  await nextTick();
  assert.equal(state.items.value[0].id, 22);
  assert.equal(state.total.value, 1);
  assert.equal(state.loading.value, false);
});

test('failed save retains the open record and reports error without publishing a revision', async (t) => {
  const { app, state } = setup(t, { update: async () => { throw new DesktopError('VALIDATION', 'Проверьте исполнителя'); } });
  await state.openRecord(1);
  assert.equal(await state.saveRecord({ ...row(), executor: '' }), false);
  assert.equal(state.selected.value.id, 1);
  assert.match(state.formError.value, /исполнителя/);
  assert.equal(app.revision, 0);
  assert.equal(app.pendingOperations, 0);
});

test('database switch closes a record and cannot update its old ID in the new database', async (t) => {
  const { app, state, requests } = setup(t);
  await state.openRecord(7);
  app.database = { ready: true, generation: 2 };
  assert.equal(await state.saveRecord(row(7)), false);
  assert.equal(state.selected.value, null);
  assert.equal(requests.some(([type]) => type === 'update'), false);
});

test('sort and pagination requests keep applied filters and reject unlisted columns', async (t) => {
  const requests = [];
  const { state } = setup(t, { list: async (request) => {
    requests.push(['list', request]); return { items: [row()], total: 120 };
  } });
  await nextTick();
  await state.setPageSize(50);
  await state.setPage(3);
  let request = requests.at(-1)[1];
  assert.equal(request.limit, 50);
  assert.equal(request.offset, 100);
  await state.changeSort('deadline');
  request = requests.at(-1)[1];
  assert.deepEqual(request.sort, { field: 'deadline', direction: 'asc' });
  assert.equal(request.offset, 0);
  await state.changeSort('deadline');
  assert.equal(requests.at(-1)[1].sort.direction, 'desc');
  const before = requests.length;
  await state.changeSort('id; DROP TABLE instructions');
  assert.equal(requests.length, before);
});

test('a slower earlier query cannot replace results of a later applied filter', async (t) => {
  let finishInitial;
  const { state } = setup(t, { list: (request) => request.filters.executor
    ? Promise.resolve({ items: [{ ...row(8), executor: 'Петров' }], total: 1 })
    : new Promise((resolve) => { finishInitial = resolve; }) });
  await nextTick();
  state.draftFilters.executor = 'Петров';
  await state.applyFilters();
  finishInitial({ items: [row(3)], total: 50 });
  await nextTick();
  assert.equal(state.items.value[0].id, 8);
  assert.equal(state.total.value, 1);
});

test('no database performs no business reads or writes and cancelled export is not an error', async (t) => {
  const { state, requests, app } = setup(t, { export: async () => ({ cancelled: true }) }, false);
  await state.refresh();
  state.createRecord();
  assert.equal(state.selected.value, null);
  assert.equal(requests.length, 0);
  app.database = { ready: true, generation: 2 };
  await nextTick();
  await state.exportRecords();
  assert.equal(state.error.value, '');
  assert.equal(state.notice.value, 'Выгрузка отменена.');
});
