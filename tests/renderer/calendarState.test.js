import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, nextTick, reactive } from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useCalendar } from '../../src/renderer/composables/useCalendar.js';
import { createCalendarStore } from '../../src/renderer/stores/calendarStore.js';
import { DesktopError } from '../../src/shared/errors.js';
import { useAppStore } from '../../src/renderer/stores/appStore.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(t, service) {
  const app = reactive({
    database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    pendingOperations: 0,
    async withOperation(fn) { this.pendingOperations += 1; try { return await fn(); } finally { this.pendingOperations -= 1; } },
    touchData() { this.revision += 1; },
  });
  const pinia = createPinia();
  const store = createCalendarStore({ getApp: () => app, service, initialDate: () => '2026-10-23' })(pinia);
  const scopes = [];
  function mount() {
    const scope = effectScope();
    const calendar = scope.run(() => useCalendar({ store, now: () => new Date(2026, 9, 23, 12), trackDate: false }));
    scopes.push(scope);
    return { scope, calendar };
  }
  const { scope, calendar } = mount();
  t.after(() => { scopes.forEach((item) => item.stop()); disposePinia(pinia); });
  return { app, calendar, store, scope, mount };
}

test('late calendar responses from a previous database cannot replace current data', async (t) => {
  const oldMonth = deferred();
  const oldDay = deferred();
  const service = {
    month: ({ generation }) => generation === 1 ? oldMonth.promise : Promise.resolve({ days: [{ date: '2026-10-23', controls: 2 }] }),
    day: ({ generation }) => generation === 1 ? oldDay.promise : Promise.resolve({ instructions: [{ id: 22 }], tasks: [] }),
  };
  const { app, calendar } = setup(t, service);
  app.database = { ready: true, generation: 2 };
  await calendar.refresh();
  oldMonth.resolve({ days: [{ date: '2026-10-23', controls: 99 }] });
  oldDay.resolve({ instructions: [{ id: 11 }], tasks: [] });
  await nextTick();
  await nextTick();
  assert.equal(calendar.monthDays.value[0].controls, 2);
  assert.equal(calendar.instructions.value[0].id, 22);
  assert.equal(calendar.monthLoading.value, false);
  assert.equal(calendar.dayLoading.value, false);
});

test('a slower selected day cannot overwrite the most recent selection', async (t) => {
  const oldDay = deferred();
  const { calendar } = setup(t, {
    month: async () => ({ days: [] }),
    day: ({ date }) => date === '2026-10-23' ? oldDay.promise : Promise.resolve({ instructions: [], tasks: [{ id: 24, date }] }),
  });
  calendar.selectDate('2026-10-24');
  await nextTick();
  await calendar.fetchDay();
  oldDay.resolve({ instructions: [], tasks: [{ id: 23 }] });
  await nextTick();
  assert.equal(calendar.tasks.value[0].id, 24);
});

test('a draft from an old database cannot write an ID into the new database', async (t) => {
  let writes = 0;
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [] }), day: async () => ({ instructions: [], tasks: [] }),
    updateTask: async () => { writes += 1; },
  });
  app.database = { ready: true, generation: 2 };
  await assert.rejects(calendar.saveTask(9, { title: 'Старая форма' }, 1), /баз/i);
  assert.equal(writes, 0);
  assert.equal(app.revision, 0);
});

test('saving a task binds its generation, tracks pending operations and refreshes counts', async (t) => {
  const save = deferred();
  const requests = [];
  let count = 0;
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [{ date: '2026-10-23', tasks: count }] }),
    day: async () => ({ instructions: [], tasks: [] }),
    createTask: async (payload) => { requests.push(payload); await save.promise; count = 1; return { id: 3 }; },
  });
  const pending = calendar.saveTask(null, { title: 'Доклад', date: '2026-10-23' }, 1);
  assert.equal(app.pendingOperations, 1);
  save.resolve();
  await pending;
  await nextTick();
  await nextTick();
  assert.deepEqual(requests, [{ data: { title: 'Доклад', date: '2026-10-23' }, generation: 1 }]);
  assert.equal(app.pendingOperations, 0);
  assert.equal(app.revision, 1);
  assert.equal(calendar.monthDays.value[0].tasks, 1);
});

test('removing the active database clears both lists and late failures stay hidden', async (t) => {
  const oldDay = deferred();
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [{ date: '2026-10-23', tasks: 1 }] }),
    day: () => oldDay.promise,
  });
  app.database = { ready: false, generation: 2 };
  await nextTick();
  oldDay.reject(new Error('old database failure'));
  await nextTick();
  assert.deepEqual(calendar.monthDays.value, []);
  assert.deepEqual(calendar.tasks.value, []);
  assert.equal(calendar.dayError.value, '');
  assert.equal(calendar.dayLoading.value, false);
});

test('returning after local midnight updates urgency date without moving the selection', (t) => {
  let now = new Date(2026, 9, 23, 23, 59);
  const app = reactive({ database: { ready: false, generation: 1 }, revision: 0 });
  const pinia = createPinia();
  const store = createCalendarStore({ getApp: () => app, initialDate: () => '2026-10-23' })(pinia);
  const scope = effectScope();
  const calendar = scope.run(() => useCalendar({ store, now: () => now, trackDate: false }));
  t.after(() => { scope.stop(); disposePinia(pinia); });
  now = new Date(2026, 9, 24, 0, 1);
  calendar.refreshToday();
  assert.equal(calendar.today.value, '2026-10-24');
  assert.equal(calendar.selectedDate.value, '2026-10-23');
  calendar.goToday();
  assert.equal(calendar.selectedDate.value, '2026-10-24');
});

test('identical pending calendar reads share IPC and accept the shared response', async (t) => {
  const month = deferred();
  const day = deferred();
  let monthCalls = 0;
  let dayCalls = 0;
  const { calendar } = setup(t, {
    month: () => { monthCalls++; return month.promise; },
    day: () => { dayCalls++; return day.promise; },
  });
  const reads = [calendar.fetchMonth(), calendar.fetchMonth(), calendar.fetchDay(), calendar.fetchDay()];
  await nextTick();
  assert.equal(monthCalls, 1);
  assert.equal(dayCalls, 1);
  month.resolve({ days: [{ date: '2026-10-23', controls: 3 }] });
  day.resolve({ instructions: [], tasks: [{ id: 7 }] });
  await Promise.all(reads);
  assert.equal(calendar.monthDays.value[0].controls, 3);
  assert.equal(calendar.tasks.value[0].id, 7);
  assert.equal(calendar.monthLoading.value, false);
});

test('calendar navigation survives remount without refetching fresh snapshots', async (t) => {
  let monthCalls = 0;
  let dayCalls = 0;
  const { calendar, scope, mount } = setup(t, {
    month: async () => { monthCalls++; return { days: [] }; },
    day: async ({ date }) => { dayCalls++; return { instructions: [], tasks: [{ id: 5, date }] }; },
  });
  await calendar.refresh();
  calendar.selectDate('2026-11-05');
  await nextTick();
  await calendar.refresh();
  scope.stop();
  const again = mount().calendar;
  await again.refresh();
  assert.equal(again.month.value, '2026-11');
  assert.equal(again.selectedDate.value, '2026-11-05');
  assert.equal(again.tasks.value[0].date, '2026-11-05');
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
});

test('an inactive calendar invalidates on revision and fetches once when reopened', async (t) => {
  let monthCalls = 0;
  let dayCalls = 0;
  const { app, calendar, scope, mount } = setup(t, {
    month: async () => { monthCalls++; return { days: [] }; },
    day: async () => { dayCalls++; return { instructions: [], tasks: [] }; },
  });
  await calendar.refresh();
  scope.stop();
  app.touchData();
  await nextTick();
  assert.equal(monthCalls, 1);
  assert.equal(dayCalls, 1);
  const again = mount().calendar;
  await again.refresh();
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
});

test('a pending old revision cannot replace the refreshed calendar or poison remount', async (t) => {
  const oldMonth = deferred();
  const oldDay = deferred();
  let monthCalls = 0;
  let dayCalls = 0;
  const { app, calendar, scope, mount } = setup(t, {
    month: () => ++monthCalls === 1 ? oldMonth.promise : Promise.resolve({ days: [{ date: '2026-10-23', tasks: 2 }] }),
    day: () => ++dayCalls === 1 ? oldDay.promise : Promise.resolve({ instructions: [], tasks: [{ id: 2 }] }),
  });
  app.touchData();
  await calendar.refresh();
  oldMonth.resolve({ days: [{ date: '2026-10-23', tasks: 99 }] });
  oldDay.resolve({ instructions: [], tasks: [{ id: 99 }] });
  await nextTick();
  scope.stop();
  const again = mount().calendar;
  await again.refresh();
  assert.equal(again.monthDays.value[0].tasks, 2);
  assert.equal(again.tasks.value[0].id, 2);
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
});

test('failed task completion retains its saved value and does not invalidate fresh reads', async (t) => {
  const task = { id: 6, title: 'Доклад', date: '2026-10-23', description: '', priority: 'normal', completed: false };
  let monthCalls = 0;
  const { app, calendar } = setup(t, {
    month: async () => { monthCalls++; return { days: [] }; },
    day: async () => ({ instructions: [], tasks: [task] }),
    updateTask: async () => { throw new DesktopError('DATABASE_UNAVAILABLE', 'Не удалось записать SQLite'); },
  });
  await calendar.refresh();
  await calendar.toggleTask(calendar.tasks.value[0]);
  await calendar.refresh();
  assert.equal(calendar.tasks.value[0].completed, false);
  assert.match(calendar.taskError.value, /SQLite/);
  assert.equal(calendar.busyTaskId.value, null);
  assert.equal(app.revision, 0);
  assert.equal(monthCalls, 1);
});

test('a successful mutation refreshes each active query exactly once', async (t) => {
  let monthCalls = 0;
  let dayCalls = 0;
  const { calendar } = setup(t, {
    month: async () => { monthCalls++; return { days: [] }; },
    day: async () => { dayCalls++; return { instructions: [], tasks: [] }; },
    createTask: async () => ({ id: 4 }),
  });
  await calendar.refresh();
  await calendar.saveTask(null, { title: 'Доклад', date: '2026-10-23' }, 1);
  await calendar.refresh();
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
});

test('returning while the initial read is pending shares it across view lifetimes', async (t) => {
  const day = deferred();
  const month = deferred();
  let monthCalls = 0;
  let dayCalls = 0;
  const { scope, mount } = setup(t, {
    month: () => { monthCalls++; return month.promise; },
    day: () => { dayCalls++; return day.promise; },
  });
  scope.stop();
  const again = mount().calendar;
  const reading = again.refresh();
  month.resolve({ days: [] });
  day.resolve({ instructions: [], tasks: [{ id: 8 }] });
  await reading;
  assert.equal(monthCalls, 1);
  assert.equal(dayCalls, 1);
  assert.equal(again.tasks.value[0].id, 8);
});

test('returning to a pending date reuses its request and accepts it as the current selection', async (t) => {
  const firstDay = deferred();
  let dayCalls = 0;
  const { calendar } = setup(t, {
    month: async () => ({ days: [] }),
    day: ({ date }) => { dayCalls++; return date === '2026-10-23' ? firstDay.promise : Promise.resolve({ instructions: [], tasks: [{ id: 24 }] }); },
  });
  calendar.selectDate('2026-10-24');
  await nextTick();
  calendar.selectDate('2026-10-23');
  await nextTick();
  firstDay.resolve({ instructions: [], tasks: [{ id: 23 }] });
  await calendar.fetchDay();
  assert.equal(dayCalls, 2);
  assert.equal(calendar.tasks.value[0].id, 23);
});

test('request payloads retain the query captured before an immediate navigation', async (t) => {
  const months = [];
  const dates = [];
  const { calendar } = setup(t, {
    month: async ({ month }) => { months.push(month); return { days: [] }; },
    day: async ({ date }) => { dates.push(date); return { instructions: [], tasks: [] }; },
  });
  calendar.selectDate('2026-11-05');
  await nextTick();
  await calendar.refresh();
  assert.deepEqual(months, ['2026-10', '2026-11']);
  assert.deepEqual(dates, ['2026-10-23', '2026-11-05']);
});

test('an unrelated revision refresh cannot unlock a pending task completion', async (t) => {
  const writing = deferred();
  const task = { id: 6, title: 'Доклад', date: '2026-10-23', description: '', priority: 'normal', completed: false };
  let writes = 0;
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [] }), day: async () => ({ instructions: [], tasks: [task] }),
    updateTask: async () => { writes++; await writing.promise; return { ...task, completed: true }; },
  });
  await calendar.refresh();
  const toggling = calendar.toggleTask(task);
  app.touchData();
  await calendar.refresh();
  assert.equal(calendar.busyTaskId.value, 6);
  await calendar.toggleTask(task);
  assert.equal(writes, 1);
  writing.resolve();
  await toggling;
  assert.equal(calendar.busyTaskId.value, null);
});

test('a completed write from an old generation cannot invalidate the replacement database', async (t) => {
  const writing = deferred();
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [] }), day: async () => ({ instructions: [], tasks: [] }),
    createTask: () => writing.promise,
  });
  const saving = calendar.saveTask(null, { title: 'Старая база', date: '2026-10-23' }, 1);
  app.database = { ready: true, generation: 2 };
  writing.resolve({ id: 5 });
  await assert.rejects(saving, (error) => error.code === 'DATABASE_CHANGED');
  assert.equal(app.revision, 0);
});

test('the production Pinia calendar preserves selection when its page is mounted again', (t) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = useAppStore();
  app.database = { ready: false, generation: 1 };
  const firstScope = effectScope();
  const first = firstScope.run(() => useCalendar({ trackDate: false }));
  first.selectDate('2028-02-29');
  firstScope.stop();
  const secondScope = effectScope();
  const second = secondScope.run(() => useCalendar({ trackDate: false }));
  t.after(() => { firstScope.stop(); secondScope.stop(); disposePinia(pinia); });
  assert.equal(second.selectedDate.value, '2028-02-29');
  assert.equal(second.month.value, '2028-02');
});

test('page focus updates its local clock and its listener is removed on disposal', (t) => {
  const previousWindow = globalThis.window;
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  const pinia = createPinia();
  const app = reactive({ database: { ready: false, generation: 1 }, revision: 0 });
  const store = createCalendarStore({ getApp: () => app, initialDate: () => '2026-10-23' })(pinia);
  let now = new Date(2026, 9, 23, 23, 59);
  const scope = effectScope();
  const calendar = scope.run(() => useCalendar({ store, now: () => now }));
  t.after(() => { scope.stop(); disposePinia(pinia); globalThis.window = previousWindow; });
  now = new Date(2026, 9, 24, 0, 1);
  listeners.get('focus')();
  assert.equal(calendar.today.value, '2026-10-24');
  assert.equal(calendar.selectedDate.value, '2026-10-23');
  scope.stop();
  assert.equal(listeners.has('focus'), false);
});
