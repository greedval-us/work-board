import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createPinia, disposePinia } from 'pinia';
import { effectScope, reactive } from 'vue';
import { createNotificationsStore } from '../../src/renderer/features/notifications/notificationsStore.js';
import { useNotifications } from '../../src/renderer/features/notifications/useNotifications.js';

const day = '2026-11-12';
const reminder = (overrides = {}) => ({
  id: 'task:1:created', occurrence: `${day}:${day}`, kind: 'task', recordId: 1,
  date: day, title: 'Подготовить отчёт', unread: true, popupPending: true, ...overrides,
});
const snapshot = items => ({ today: day, items });

test('disabling planning removes visible plan popups while keeping other reminders', async t => {
  const task = reminder();
  const plan = reminder({ kind: 'plan', id: 'plan:1:created' });
  const items = [task, plan];
  const { app, store } = setup(t, {
    list: async () => snapshot(items),
    acknowledge: async () => snapshot(items.map(item => ({ ...item, popupPending: false }))),
  });
  app.planningEnabled = true;
  await store.refresh();
  await setImmediate();
  assert.deepEqual(store.popup.items.map(item => item.kind), ['task', 'plan']);
  app.planningEnabled = false;
  assert.deepEqual(store.items.map(item => item.kind), ['task']);
  assert.deepEqual(store.popup.items.map(item => item.kind), ['task']);
  await store.refresh();
  assert.equal(store.unreadCount, 1);
});
function setup(t, service, options = {}) {
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    pendingOperations: 0,
    async withOperation(operation) { this.pendingOperations++; try { return await operation(); } finally { this.pendingOperations--; } },
  });
  const pinia = createPinia();
  const store = createNotificationsStore({ getApp: () => app, service, canShowPopup: () => true, ...options })(pinia);
  t.after(() => disposePinia(pinia));
  return { app, store };
}

test('popup acknowledgement keeps reminders unread and does not repeat after refresh', async t => {
  let item = reminder(); const acknowledgements = [];
  const { store } = setup(t, {
    list: async () => snapshot([item]),
    acknowledge: async payload => {
      acknowledgements.push(payload);
      item = { ...item, popupPending: payload.popup ? false : item.popupPending, unread: payload.read ? false : item.unread };
      return snapshot([item]);
    },
  });
  await store.refresh(); await setImmediate();
  assert.equal(store.popup.items.length, 1);
  assert.equal(store.unreadCount, 1);
  assert.equal(acknowledgements[0].popup, true);
  assert.equal(acknowledgements[0].read, undefined);
  store.dismissPopup(); await store.refresh(); await setImmediate();
  assert.equal(store.popup, null);
  assert.equal(acknowledgements.length, 1);
  assert.equal(await store.markAllRead(), true);
  assert.equal(store.unreadCount, 0);
});

test('old database replies and popups never leak into the newly selected database', async t => {
  const pending = Promise.withResolvers();
  const { app, store } = setup(t, { list: ({ generation }) => generation === 1 ? pending.promise : Promise.resolve(snapshot([])) });
  const old = store.refresh(); await setImmediate();
  app.database = { ready: true, generation: 2 };
  await store.refresh();
  pending.resolve(snapshot([reminder()])); await old;
  assert.deepEqual(store.items, []); assert.equal(store.popup, null); assert.equal(store.error, '');
});

test('new daily occurrences alert again but dismissed popups do not repeat after a failed receipt write', async t => {
  let item = reminder(); let writes = 0;
  const { store } = setup(t, {
    list: async () => snapshot([item]),
    acknowledge: async () => { writes++; throw new Error('SQL sensitive detail'); },
  });
  await store.refresh(); await setImmediate();
  assert.match(store.error, /сохранить/i); assert.doesNotMatch(store.error, /SQL/);
  store.dismissPopup(); await store.refresh(); await setImmediate();
  assert.equal(store.popup, null); assert.ok(writes >= 1);
  item = reminder({ occurrence: `${day}:2026-11-13` });
  await store.refresh(); await setImmediate(); assert.equal(store.popup.items[0].occurrence, item.occurrence);
});

test('completion and date changes remove stale entries from an already visible popup', async t => {
  let items = [reminder()];
  const { store } = setup(t, {
    list: async () => snapshot(items),
    acknowledge: async () => snapshot(items.map(item => ({ ...item, popupPending: false }))),
  });
  await store.refresh(); await setImmediate(); assert.ok(store.popup);
  items = []; await store.refresh(); assert.equal(store.popup, null); assert.deepEqual(store.items, []);
});

test('hidden or modal-covered application waits to show and acknowledge a popup', async t => {
  let visible = false; let writes = 0;
  const { store } = setup(t, {
    list: async () => snapshot([reminder()]),
    acknowledge: async () => { writes++; return snapshot([reminder({ popupPending: false })]); },
  }, { canShowPopup: () => visible });
  await store.refresh(); assert.equal(store.popup, null); assert.equal(writes, 0);
  visible = true; await store.refresh(); await setImmediate(); assert.ok(store.popup); assert.equal(writes, 1);
});

test('a read acknowledgement cannot replace newer record data after revision changes', async t => {
  const write = Promise.withResolvers(); let items = [reminder({ popupPending: false })];
  const { app, store } = setup(t, { list: async () => snapshot(items), acknowledge: () => write.promise });
  await store.refresh(); const marked = store.markAllRead(); await setImmediate();
  assert.equal(app.pendingOperations, 1);
  items = []; app.revision++;
  const updated = store.refresh();
  write.resolve(snapshot([reminder({ unread: false, popupPending: false })]));
  await marked; await updated;
  assert.deepEqual(store.items, []); assert.equal(app.pendingOperations, 0);
});

test('a list response from before acknowledgement cannot regain validity during a newer same-revision refresh', async t => {
  const oldRead = Promise.withResolvers(); const newRead = Promise.withResolvers(); let reads = 0;
  const item = reminder({ popupPending: false });
  const { store } = setup(t, {
    list: () => ++reads === 1 ? Promise.resolve(snapshot([item])) : reads === 2 ? oldRead.promise : newRead.promise,
    acknowledge: async () => snapshot([{ ...item, unread: false }]),
  });
  await store.refresh();
  const old = store.refresh(); await setImmediate();
  await store.markAllRead(); assert.equal(store.unreadCount, 0);
  const latest = store.refresh(); await setImmediate();
  oldRead.resolve(snapshot([item])); await old;
  assert.equal(store.unreadCount, 0);
  newRead.resolve(snapshot([{ ...item, unread: false }])); await latest;
  assert.equal(store.unreadCount, 0);
});

test('disposal suppresses late failures and readiness loss clears displayed notifications immediately', async t => {
  const failure = Promise.withResolvers(); let first = true;
  const { app, store } = setup(t, { list: () => first ? Promise.resolve(snapshot([reminder({ popupPending: false })])) : failure.promise });
  await store.refresh(); assert.equal(store.items.length, 1);
  app.databaseSwitching = true; assert.deepEqual(store.items, []);
  app.databaseSwitching = false; first = false;
  const request = store.refresh(); await setImmediate(); store.$dispose();
  failure.reject(new Error('private')); await request; assert.equal(store.error, '');
});

test('refresh timer pauses while hidden and resumes on visibility and focus', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget(); documentTarget.visibilityState = 'hidden';
  let acquired = 0; let released = 0; let refreshed = 0;
  const timers = new Set();
  const scope = effectScope();
  scope.run(() => useNotifications({
    store: { acquire: () => { acquired++; return () => released++; }, refresh: () => refreshed++ },
    windowTarget, documentTarget, now: () => new Date(2026, 10, 12, 23, 59, 59),
    schedule: (callback, delay) => {
      const timer = { callback, delay };
      timers.add(timer);
      return timer;
    },
    cancel: timer => timers.delete(timer),
  }));
  assert.equal(acquired, 1);
  assert.equal(timers.size, 0);
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshed, 1);
  assert.equal(timers.size, 1);
  const [timer] = timers;
  assert.ok(timer.delay < 2000);
  timers.delete(timer);
  timer.callback();
  assert.equal(refreshed, 2);
  assert.equal(timers.size, 1);
  documentTarget.visibilityState = 'hidden';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 0);
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  windowTarget.dispatchEvent(new Event('focus'));
  assert.equal(refreshed, 2);
  assert.equal(timers.size, 0);
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshed, 3);
  assert.equal(timers.size, 1);
  windowTarget.dispatchEvent(new Event('focus'));
  assert.equal(refreshed, 4);
  assert.equal(timers.size, 1);
  scope.stop();
  assert.equal(released, 1);
  windowTarget.dispatchEvent(new Event('focus'));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshed, 4);
  assert.equal(timers.size, 0);
});

test('native delivery suppresses renderer popups and surfaces delivery errors without marking unread items', async t => {
  let delivery = { mode: 'system', error: '' }; let writes = 0;
  const { store } = setup(t, {
    list: async () => ({ ...snapshot([reminder()]), delivery }),
    acknowledge: async () => { writes++; return snapshot([]); },
  });
  await store.refresh(); await setImmediate();
  assert.equal(store.popup, null); assert.equal(writes, 0); assert.equal(store.unreadCount, 1);
  delivery = { mode: 'system', error: 'Windows не удалось показать напоминание.' };
  await store.refresh(); assert.equal(store.error, delivery.error);
});

test('native click requests the bell only for the current database and leaves unread state intact', async t => {
  const { app, store } = setup(t, { list: async () => ({ ...snapshot([reminder()]), delivery: { mode: 'system', error: '' } }) });
  assert.equal(await store.openFromSystem({ generation: 9 }), false);
  assert.equal(store.openRequest, 0);
  assert.equal(await store.openFromSystem({ generation: 1 }), true);
  assert.equal(store.openRequest, 1); assert.equal(store.unreadCount, 1);
  app.database = { ready: true, generation: 2 };
  assert.equal(await store.openFromSystem({ generation: 1 }), false);
});

test('a locked workspace pauses reminder details and defers opening the notification center', async t => {
  const previous = Promise.withResolvers();
  const item = reminder({ popupPending: false });
  let reads = 0;
  const { app, store } = setup(t, {
    list: () => ++reads === 1 ? previous.promise : Promise.resolve(snapshot([item])),
  });
  const old = store.refresh();
  await setImmediate();
  app.workspaceLocked = true;
  const open = store.openFromSystem({ generation: 1 });
  const lockedRead = store.refresh();
  await setImmediate();
  previous.resolve(snapshot([reminder({ title: 'Устаревшая запись' })]));
  await Promise.all([old, open, lockedRead]);
  assert.equal(reads, 1);
  assert.deepEqual(store.items, []);
  assert.equal(store.openRequest, 0);
  app.workspaceLocked = false;
  await setImmediate();
  assert.deepEqual(store.items, [item]);
  assert.equal(store.openRequest, 1);
});

for (const selectedGeneration of [1, 2]) test(`a native click during bootstrap is deferred and checked against generation ${selectedGeneration}`, async t => {
  const { app, store } = setup(t, { list: async () => ({ ...snapshot([]), delivery: { mode: 'system', error: '' } }) });
  app.database = null; app.initialized = false;
  await store.openFromSystem({ generation: 1 });
  app.database = { ready: true, generation: selectedGeneration };
  app.initialized = true;
  await setImmediate();
  assert.equal(store.openRequest, selectedGeneration === 1 ? 1 : 0);
});

test('concurrent notification reads share IPC while a newer revision owns loading and the displayed snapshot', async t => {
  const previous = Promise.withResolvers();
  const fresh = Promise.withResolvers();
  let calls = 0;
  const { app, store } = setup(t, {
    list: () => ++calls === 1 ? previous.promise : fresh.promise,
  });
  const first = store.refresh();
  const duplicate = store.refresh();
  await setImmediate();
  assert.equal(calls, 1);
  app.revision++;
  const latest = store.refresh();
  await setImmediate();
  previous.resolve(snapshot([reminder({ popupPending: false })]));
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true]);
  assert.deepEqual(store.items, []);
  assert.equal(store.loading, true);
  fresh.resolve(snapshot([reminder({ unread: false, popupPending: false })]));
  assert.equal(await latest, true);
  assert.equal(store.unreadCount, 0);
  assert.equal(store.loading, false);
  assert.equal(calls, 2);
});
