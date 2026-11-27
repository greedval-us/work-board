import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, nextTick, reactive } from 'vue';
import { createPinia, disposePinia, setActivePinia } from 'pinia';
import { useCalendar } from '../../src/renderer/features/calendar/useCalendar.js';
import { createCalendarStore } from '../../src/renderer/features/calendar/calendarStore.js';
import { createTaskStore } from '../../src/renderer/features/tasks/taskStore.js';
import { DesktopError } from '../../src/shared/errors.js';
import { useAppStore } from '../../src/renderer/app/appStore.js';

function setup(t, service) {
  const app = reactive({
    database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    pendingOperations: 0,
    async withOperation(fn) { this.pendingOperations += 1; try { return await fn(); } finally { this.pendingOperations -= 1; } },
    touchData() { this.revision += 1; },
  });
  const pinia = createPinia();
  const store = createCalendarStore({ getApp: () => app, service, initialDate: () => '2026-10-23' })(pinia);
  const taskStore = createTaskStore({ getApp: () => app, service })(pinia);
  const scopes = [];
  function mount() {
    const scope = effectScope();
    const calendar = scope.run(() => useCalendar({ store, taskStore, now: () => new Date(2026, 9, 23, 12), trackDate: false }));
    scopes.push(scope);
    return { scope, calendar };
  }
  const { scope, calendar } = mount();
  t.after(() => { scopes.forEach((item) => item.stop()); disposePinia(pinia); });
  return { app, calendar, store, scope, mount };
}

test('late calendar responses from a previous database cannot replace current data', async (t) => {
  const oldMonth = Promise.withResolvers();
  const oldDay = Promise.withResolvers();
  const checkpoint = { instructionId: 22, date: '2026-10-23', mark: '', scheduled: true };
  const service = {
    month: ({ generation }) => generation === 1 ? oldMonth.promise : Promise.resolve({ days: [{ date: '2026-10-23', controls: 2, checkpoints: 1 }] }),
    day: ({ generation }) => generation === 1 ? oldDay.promise : Promise.resolve({ instructions: [{ id: 22 }], tasks: [], checkpoints: [checkpoint] }),
  };
  const { app, calendar } = setup(t, service);
  app.database = { ready: true, generation: 2 };
  await calendar.refresh();
  oldMonth.resolve({ days: [{ date: '2026-10-23', controls: 99 }] });
  oldDay.resolve({ instructions: [{ id: 11 }], tasks: [], checkpoints: [{ ...checkpoint, instructionId: 11 }] });
  await nextTick();
  await nextTick();
  assert.equal(calendar.monthDays.value[0].controls, 2);
  assert.equal(calendar.instructions.value[0].id, 22);
  assert.deepEqual(calendar.checkpoints.value, [checkpoint]);
  const selected = calendar.grid.value.find(day => day.date === '2026-10-23');
  assert.equal(selected.checkpoints, 1);
  assert.equal(selected.completedCheckpoints, 0);
  assert.equal(calendar.monthLoading.value, false);
  assert.equal(calendar.dayLoading.value, false);
});

test('disabling planning clears its calendar entries and rejects late responses from the enabled view', async t => {
  const oldDay = Promise.withResolvers();
  const oldMonth = Promise.withResolvers();
  let hold = false;
  const enabledDay = { plans: [{ id: 1 }], planCheckpoints: [{ planId: 1 }] };
  const enabledMonth = { days: [{ date: '2026-10-23', plans: 1, planCheckpoints: 1 }] };
  const { app, store } = setup(t, {
    month: () => hold ? oldMonth.promise : app.planningEnabled ? enabledMonth : { days: [] },
    day: () => hold ? oldDay.promise : app.planningEnabled ? enabledDay : { tasks: [{ id: 3 }] },
  });
  app.planningEnabled = true;
  await store.refresh();
  assert.deepEqual(store.plans, enabledDay.plans);
  assert.deepEqual(store.planCheckpoints, enabledDay.planCheckpoints);
  hold = true;
  const pending = [store.fetchMonth({ force: true }), store.fetchDay({ force: true })];
  await nextTick();
  hold = false;
  app.planningEnabled = false;
  assert.deepEqual(store.monthDays, []);
  await store.refresh();
  oldDay.resolve(enabledDay);
  oldMonth.resolve(enabledMonth);
  await Promise.all(pending);
  assert.deepEqual(store.plans, []);
  assert.deepEqual(store.planCheckpoints, []);
  assert.deepEqual(store.monthDays, []);
  assert.deepEqual(store.tasks, [{ id: 3 }]);
});

test('a slower selected day cannot overwrite the most recent selection', async (t) => {
  const oldDay = Promise.withResolvers();
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
  assert.deepEqual(calendar.checkpoints.value, []);
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
  const save = Promise.withResolvers();
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
  const oldDay = Promise.withResolvers();
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
  const month = Promise.withResolvers();
  const day = Promise.withResolvers();
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
  const oldMonth = Promise.withResolvers();
  const oldDay = Promise.withResolvers();
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

test('calendar completes a repeat on its occurrence date without changing the series', async (t) => {
  const task = { id: 6, title: 'Доклад', date: '2026-10-23', seriesDate: '2026-10-16',
    recurrence: { frequency: 'weekly' }, completed: false };
  const writes = [];
  const { app, calendar } = setup(t, {
    month: async () => ({ days: [] }),
    day: async () => ({ tasks: [task] }),
    setOccurrenceCompleted: async (request) => writes.push(request),
    updateTask: () => assert.fail('Occurrence completion must not rewrite the series'),
  });
  await calendar.refresh();
  await calendar.toggleTask(task);
  assert.deepEqual(writes, [{ id: 6, date: '2026-10-23', completed: true, generation: 1 }]);
  assert.equal(app.revision, 1);
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
  const day = Promise.withResolvers();
  const month = Promise.withResolvers();
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
  const firstDay = Promise.withResolvers();
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
  const writing = Promise.withResolvers();
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
  const writing = Promise.withResolvers();
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

test('forced calendar refreshes share pending reads and preserve only the month while loading', async t => {
  const month = Promise.withResolvers();
  const day = Promise.withResolvers();
  let monthCalls = 0;
  let dayCalls = 0;
  const { store } = setup(t, {
    month: () => ++monthCalls === 1 ? { days: [{ date: '2026-10-23', tasks: 1 }] } : month.promise,
    day: () => ++dayCalls === 1 ? { instructions: [], tasks: [{ id: 1 }], checkpoints: [] } : day.promise,
  });
  await store.refresh();
  const reads = [store.fetchMonth({ force: true }), store.fetchDay({ force: true }),
    store.fetchMonth({ force: true }), store.fetchDay({ force: true })];
  await nextTick();
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
  assert.equal(store.monthDays[0].tasks, 1);
  assert.deepEqual(store.tasks, []);
  assert.equal(store.monthLoading, true);
  assert.equal(store.dayLoading, true);
  month.resolve({ days: [{ date: '2026-10-23', tasks: 2 }] });
  day.resolve({ instructions: [], tasks: [{ id: 2 }], checkpoints: [] });
  await Promise.all(reads);
  await store.refresh();
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
  assert.equal(store.monthDays[0].tasks, 2);
  assert.equal(store.tasks[0].id, 2);
  assert.equal(store.monthLoading, false);
  assert.equal(store.dayLoading, false);
});

test('a failed forced calendar refresh keeps its successful cache available for returning navigation', async t => {
  let fail = false;
  let calls = 0;
  const { store } = setup(t, {
    month: () => { calls++; if (fail) throw new Error('private SQLite detail'); return { days: [{ date: '2026-10-23', tasks: 1 }] }; },
    day: () => { calls++; if (fail) throw new Error('private SQLite detail'); return { instructions: [], tasks: [{ id: 1 }], checkpoints: [] }; },
  });
  await store.refresh();
  fail = true;
  await Promise.all([store.fetchMonth({ force: true }), store.fetchDay({ force: true })]);
  assert.equal(store.monthDays[0].tasks, 1);
  assert.deepEqual(store.tasks, []);
  assert.match(store.monthError, /календарь/);
  assert.match(store.dayError, /день/);
  assert.doesNotMatch(store.monthError + store.dayError, /SQLite/);
  await store.refresh();
  assert.equal(calls, 4);
  assert.equal(store.tasks[0].id, 1);
  assert.equal(store.monthError, '');
  assert.equal(store.dayError, '');
});

test('returning to the calendar waits for an ongoing refresh before restoring the cached day', async t => {
  const month = Promise.withResolvers();
  const day = Promise.withResolvers();
  let monthCalls = 0;
  let dayCalls = 0;
  const { store, scope, mount } = setup(t, {
    month: () => ++monthCalls === 1 ? { days: [{ tasks: 1 }] } : month.promise,
    day: () => ++dayCalls === 1 ? { tasks: [{ id: 1 }] } : day.promise,
  });
  await store.refresh();
  const manual = [store.fetchMonth({ force: true }), store.fetchDay({ force: true })];
  scope.stop();
  const returned = mount().calendar.refresh();
  assert.equal(store.monthLoading, true);
  assert.equal(store.dayLoading, true);
  assert.equal(store.monthDays[0].tasks, 1);
  assert.deepEqual(store.tasks, []);
  month.resolve({ days: [{ tasks: 2 }] });
  day.resolve({ tasks: [{ id: 2 }] });
  await Promise.all([...manual, returned]);
  assert.equal(store.monthDays[0].tasks, 2);
  assert.equal(store.tasks[0].id, 2);
  assert.equal(monthCalls, 2);
  assert.equal(dayCalls, 2);
});

test('restoring database readiness cannot revive a calendar read invalidated for the same date', async t => {
  const oldDay = Promise.withResolvers();
  let calls = 0;
  const { app, store } = setup(t, {
    month: async () => ({ days: [] }),
    day: () => ++calls === 1 ? oldDay.promise : { tasks: [{ id: 2 }] },
  });
  const old = store.fetchDay();
  await nextTick();
  app.database.ready = false;
  app.database.ready = true;
  await store.refresh();
  oldDay.resolve({ tasks: [{ id: 1 }] });
  await old;
  assert.equal(store.tasks[0].id, 2);
});
