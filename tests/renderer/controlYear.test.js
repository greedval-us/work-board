import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope, reactive, ref } from 'vue';
import { useControlYear } from '../../src/renderer/features/control/year/useControlYear.js';
import { groupYearEvents, isYearEventOverdue } from '../../src/renderer/features/control/year/yearOverdue.js';

test('annual overdue markers count outstanding events and follow local midnight without changing receipts', () => {
  const events = [
    { date: '2026-11-22', kind: 'deadline', completed: false },
    { date: '2026-11-22', kind: 'checkpoint', recordCompleted: false, completed: false },
    { date: '2026-11-22', kind: 'checkpoint', recordCompleted: true, completed: false },
    { date: '2026-11-22', kind: 'checkpoint', recordCompleted: false, completed: true },
    { date: '2026-11-22', kind: 'deadline', completed: true },
    { date: '2026-11-23', kind: 'checkpoint', recordCompleted: false, completed: false },
    { date: '2026-11-24', kind: 'deadline', completed: false },
  ];
  const today = '2026-11-23';
  assert.deepEqual(events.map(event => isYearEventOverdue(event, today, false)), [true, true, false, false, false, false, false]);
  const all = groupYearEvents(events, today, false, false);
  assert.equal(all.size, 3);
  assert.deepEqual(all.get('2026-11-22'), { events: events.slice(0, 5), overdue: 2 });
  assert.equal(all.get('2026-11-23').overdue, 0);
  assert.equal(groupYearEvents(events, today, true, false).get('2026-11-22').overdue, 0);
  const filtered = groupYearEvents(events, today, false, true);
  assert.deepEqual([...filtered], [['2026-11-22', { events: events.slice(0, 2), overdue: 2 }]]);
  const tomorrow = groupYearEvents(events, '2026-11-24', false, true);
  assert.deepEqual(tomorrow.get('2026-11-23'), { events: [events[5]], overdue: 1 });
});

test('year view loads on demand and accepts only the active year, database and scope', async () => {
  const app = reactive({ database: { ready: true, generation: 3 }, revision: 0, planningEnabled: true });
  const closed = ref(false);
  const calls = [];
  const scope = effectScope();
  const calendar = scope.run(() => useControlYear({ app, closed, section: 'plans',
    service: { year: request => new Promise((resolve, reject) => calls.push({ request, resolve, reject })) } }));
  calendar.selectYear(2028);
  assert.equal(calls.length, 0);
  calendar.show(true);
  assert.deepEqual(calls[0].request, { section: 'plans', closed: false, year: 2028, generation: 3 });
  calendar.selectYear(2029);
  closed.value = true;
  app.database = { ready: true, generation: 4 };
  assert.deepEqual(calls[3].request, { section: 'plans', closed: true, year: 2029, generation: 4 });
  calls[3].resolve({ events: [{ id: 4 }] });
  calls[2].reject(new Error('Previous database'));
  calls[0].resolve({ events: [{ id: 1 }] });
  calls[1].resolve({ events: [{ id: 2 }] });
  await Promise.resolve();
  assert.deepEqual(calendar.events, [{ id: 4 }]);
  assert.equal(calendar.error, '');
  app.revision++;
  assert.equal(calls.length, 5);
  app.planningEnabled = false;
  calls[4].resolve({ events: [{ id: 5 }] });
  await Promise.resolve();
  assert.deepEqual(calendar.events, []);
  assert.equal(calendar.loading, false);
  app.planningEnabled = true;
  calls[5].reject(new Error('Не удалось прочитать базу.'));
  await Promise.resolve();
  assert.ok(calendar.error);
  calendar.retry();
  calendar.show(false);
  calls[6].resolve({ events: [{ id: 6 }] });
  await Promise.resolve();
  assert.deepEqual(calendar.events, []);
  calendar.show(true);
  scope.stop();
  calls[7].resolve({ events: [{ id: 7 }] });
  await Promise.resolve();
  assert.deepEqual(calendar.events, []);
});
