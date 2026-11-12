import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, nextTick, reactive, shallowRef } from 'vue';
import { DesktopError } from '../../src/shared/errors.js';
import { useCalendarTaskRoute, useRegistryRoute } from '../../src/renderer/composables/useNotificationNavigation.js';

const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await nextTick(); };
const task = (id, date = '2026-11-12') => ({ id, date, title: `Задача ${id}`, completed: false });

function fixture(t, query = {}, getTask = async ({ id }) => task(id)) {
  const app = reactive({ database: { ready: true, generation: 1 }, databaseSwitching: false, pendingOperations: 0,
    async withOperation(operation) { this.pendingOperations++; try { return await operation(); } finally { this.pendingOperations--; } } });
  const route = reactive({ name: 'Calendar', query });
  const editing = shallowRef(null);
  const selectedDate = shallowRef('2026-11-01');
  const calls = [];
  let allowClose = false;
  let closeCalls = 0;
  const requestClose = () => { closeCalls++; return allowClose; };
  const scope = effectScope();
  const navigation = scope.run(() => useCalendarTaskRoute({ app, route, editing, requestClose,
    calendar: { selectDate: (date) => { selectedDate.value = date; } },
    service: { getTask: (request) => { calls.push(request); return getTask(request); } },
  }));
  t.after(() => scope.stop());
  return { app, route, editing, selectedDate, calls, navigation, scope, allowClose: () => { allowClose = true; }, closeCalls: () => closeCalls };
}

test('task notification selects the current task date and opens its card in the captured database', async (t) => {
  const state = fixture(t, { task: '7', date: '2026-11-11', notification: 'first' }, async ({ id }) => task(id, '2026-11-13'));
  await settle();
  assert.deepEqual(state.calls, [{ id: 7, generation: 1 }]);
  assert.equal(state.editing.value.task.id, 7);
  assert.equal(state.editing.value.generation, 1);
  assert.equal(state.selectedDate.value, '2026-11-13');
  assert.equal(state.app.pendingOperations, 0);
});

test('another notification token reopens a closed task but preserves its current draft', async (t) => {
  const state = fixture(t, { task: '7', date: '2026-11-12', notification: 'first' });
  await settle();
  const draft = state.editing.value;
  state.route.query.notification = 'second';
  await settle();
  assert.equal(state.editing.value, draft);
  assert.equal(state.calls.length, 1);
  state.editing.value = null;
  state.route.query.notification = 'third';
  await settle();
  assert.equal(state.editing.value.task.id, 7);
  assert.equal(state.calls.length, 2);
});

test('task route guard protects a different draft even when the URL already contains that task ID', async (t) => {
  const state = fixture(t);
  state.editing.value = { task: task(9), generation: 1 };
  const from = { query: { task: '7', notification: 'first' } };
  const to = { query: { task: '7', notification: 'second' } };
  assert.equal(await state.navigation.guardRouteUpdate(to, from), false);
  assert.equal(state.closeCalls(), 1);
  state.allowClose();
  assert.equal(await state.navigation.guardRouteUpdate(to, from), true);
  state.editing.value = { task: task(7), generation: 1 };
  assert.equal(await state.navigation.guardRouteUpdate(to, from), true);
  assert.equal(state.closeCalls(), 2);
});

test('malformed task and date queries never issue reads or change the selected day', async (t) => {
  const state = fixture(t);
  for (const query of [{ task: '0' }, { task: '-1' }, { task: ['7'] }, { task: '9007199254740992' },
    { task: '7', date: '2026-02-30' }, { task: '7', date: ['2026-11-12'] }]) {
    state.route.query = query;
    await settle();
  }
  assert.equal(state.calls.length, 0);
  assert.equal(state.editing.value, null);
  assert.equal(state.selectedDate.value, '2026-11-01');
});

test('the most recent task notification wins when replies arrive out of order', async (t) => {
  const old = deferred();
  const state = fixture(t, { task: '7', notification: 'first' }, ({ id }) => id === 7 ? old.promise : Promise.resolve(task(id)));
  state.route.query = { task: '8', notification: 'second' };
  await settle();
  old.resolve(task(7));
  await settle();
  assert.equal(state.editing.value.task.id, 8);
});

test('a superseded token cannot open a task while its newer read is pending', async (t) => {
  const first = deferred();
  const second = deferred();
  let reads = 0;
  const state = fixture(t, { task: '7', notification: 'first' }, () => ++reads === 1 ? first.promise : second.promise);
  state.route.query.notification = 'second';
  await settle();
  first.resolve(task(7));
  await settle();
  assert.equal(state.editing.value, null);
  second.resolve(task(7));
  await settle();
  assert.equal(state.editing.value.task.id, 7);
});

test('a task response is ignored after route removal, a local action, or disposal', async (t) => {
  for (const cancel of [(state) => { state.route.query = {}; }, (state) => state.navigation.cancelPending(), (state) => state.scope.stop()]) {
    const pending = deferred();
    const state = fixture(t, { task: '7', notification: 'first' }, () => pending.promise);
    cancel(state);
    pending.resolve(task(7));
    await settle();
    assert.equal(state.editing.value, null);
  }
});

test('leaving the calendar with an inherited task query never starts another card read', async (t) => {
  const pending = deferred();
  const state = fixture(t, { task: '7', notification: 'first' }, () => pending.promise);
  state.route.name = 'Registry';
  await settle();
  pending.resolve(task(7));
  await settle();
  assert.equal(state.calls.length, 1);
  assert.equal(state.editing.value, null);
});

test('database replacement rejects an old task and waits for database switching to finish', async (t) => {
  const old = deferred();
  const state = fixture(t, { task: '7', notification: 'first' }, ({ generation }) => generation === 1 ? old.promise : Promise.resolve(task(7, '2026-12-01')));
  state.app.databaseSwitching = true;
  state.app.database = { ready: true, generation: 2 };
  await settle();
  old.resolve(task(7));
  await settle();
  assert.equal(state.editing.value, null);
  assert.equal(state.calls.length, 1);
  state.app.databaseSwitching = false;
  await settle();
  assert.equal(state.editing.value.generation, 2);
  assert.equal(state.selectedDate.value, '2026-12-01');
});

test('task link errors are safe and stale failures cannot replace current feedback', async (t) => {
  const pending = deferred();
  const state = fixture(t, { task: '7' }, ({ id }) => id === 7 ? pending.promise : Promise.resolve(null));
  state.route.query = { task: '8' };
  await settle();
  assert.match(state.navigation.error.value, /Задача не найдена/);
  pending.reject(new Error('PRIVATE SQL C:/database.sqlite'));
  await settle();
  assert.match(state.navigation.error.value, /Задача не найдена/);
  state.route.query = { task: '9' };
  await settle();
  assert.equal(state.app.pendingOperations, 0);
});

test('unexpected task lookup errors use public fallback text', async (t) => {
  const state = fixture(t, { task: '7' }, async () => { throw new Error('PRIVATE SQL'); });
  await settle();
  assert.equal(state.navigation.error.value, 'Не удалось открыть задачу.');
});

test('known task lookup errors preserve their safe message', async (t) => {
  const state = fixture(t, { task: '7' }, async () => { throw new DesktopError('NOT_FOUND', 'Задача удалена.'); });
  await settle();
  assert.equal(state.navigation.error.value, 'Задача удалена.');
});

function registryFixture(t) {
  const app = reactive({ database: { ready: true, generation: 1 }, databaseSwitching: false });
  const route = reactive({ name: 'Registry', query: { instruction: '5', checkpoint: '2026-11-12', notification: 'first' } });
  const selected = shallowRef(null);
  const selectedCheckpoint = shallowRef('');
  const calls = [];
  let guards = 0;
  const scope = effectScope();
  const navigation = scope.run(() => useRegistryRoute({ app, route, selected, selectedCheckpoint,
    openRecord: (...args) => calls.push(args), requestClose: () => { guards++; return false; },
  }));
  t.after(() => scope.stop());
  return { app, route, selected, selectedCheckpoint, calls, scope, navigation, guards: () => guards };
}

test('registry notification token reopens a closed instruction and invalidates the old request', async (t) => {
  const state = registryFixture(t);
  assert.equal(state.calls.length, 1);
  state.route.query.notification = 'second';
  await settle();
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls[0][2](), false);
  assert.equal(state.calls[1][2](), true);
  state.scope.stop();
  assert.equal(state.calls[1][2](), false);
});

test('registry preserves the same selected draft while focusing a notification checkpoint', async (t) => {
  const state = registryFixture(t);
  const draft = { id: 5, title: 'Unsaved draft' };
  state.selected.value = draft;
  state.route.query = { instruction: '5', checkpoint: '2026-11-14', notification: 'second' };
  await settle();
  assert.equal(state.calls.length, 1);
  assert.equal(state.selected.value, draft);
  assert.equal(state.selectedCheckpoint.value, '2026-11-14');
});

test('registry guards replacement of a draft independently of the previous query ID', async (t) => {
  const state = registryFixture(t);
  state.selected.value = { id: 9 };
  const from = { query: { instruction: '5', notification: 'first' } };
  const to = { query: { instruction: '5', notification: 'second' } };
  assert.equal(await state.navigation.guardRouteUpdate(to, from), false);
  state.selected.value = { id: 5 };
  assert.equal(await state.navigation.guardRouteUpdate(to, from), true);
  assert.equal(state.guards(), 1);
});

test('leaving the registry invalidates its request even if another route inherits the query', async (t) => {
  const state = registryFixture(t);
  state.route.name = 'Calendar';
  await settle();
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0][2](), false);
});
