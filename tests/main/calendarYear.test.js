import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { migrate } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';
import { CalendarService } from '../../src/main/services/CalendarService.js';

function fixture(t) {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  const database = { connection };
  const plans = new PlanRepository(database);
  const instructions = new InstructionRepository(database);
  let enabled = true;
  const calendar = new CalendarService(instructions, undefined, { plans, isPlanningEnabled: () => enabled });
  const create = (repo, extra) => repo.create({
    title: 'Проверка', instructionNumber: '23/А', executor: 'Отдел', planItem: 'п. 2',
    controlDate: '2023-01-01', deadline: '2024-01-01', ...extra,
  });
  return { calendar, plans, instructions, create, connection, disablePlanning: () => { enabled = false; } };
}

test('annual calendar reads the selected section once, with extensions, moves, marks and inclusive year bounds', t => {
  const { calendar, plans, instructions, create, connection } = fixture(t);
  create(instructions, { title: 'Указание' });
  const plan = create(plans, { deadline: '2023-12-31', extendedUntil: '2024-01-03', status: 'completed',
    controlSchedule: { frequency: 'custom', customDates: ['2023-12-30', '2024-01-01', '2024-01-03'],
      moves: [{ from: '2023-12-30', to: '2024-01-02' }], marks: [{ date: '2024-01-01', text: 'Готово' }] } });
  const other = create(plans, { deadline: '2024-01-03' });
  create(plans, { deadline: '2025-01-01', controlSchedule: { frequency: 'custom', customDates: ['2025-01-01'],
    marks: [{ date: '2024-12-31', text: 'История' }] } });
  create(plans, { deadline: '2023-12-31' });
  const prepare = t.mock.method(connection, 'prepare');
  const { events } = calendar.year({ section: 'plans', year: 2024, closed: false });
  assert.equal(prepare.mock.callCount(), 1);
  assert.deepEqual(events.map(({ date, id, kind, completed }) => [date, id, kind, completed]), [
    ['2024-01-01', plan.id, 'checkpoint', true], ['2024-01-02', plan.id, 'checkpoint', false],
    ['2024-01-03', plan.id, 'deadline', true], ['2024-01-03', plan.id, 'checkpoint', false],
    ['2024-01-03', other.id, 'deadline', false], ['2024-12-31', 3, 'checkpoint', true],
  ]);
  assert.deepEqual(events[0], { id: plan.id, date: '2024-01-01', kind: 'checkpoint', completed: true, recordCompleted: true,
    title: 'Проверка', instructionNumber: '23/А', executor: 'Отдел', planItem: 'п. 2' });
  const moved = events.find(event => event.date === '2024-01-02');
  assert.equal(moved.recordCompleted, true);
  assert.equal(moved.completed, false);
  const registry = calendar.year({ section: 'instructions', year: 2024, closed: false });
  assert.deepEqual(registry.events, [{ id: 1, date: '2024-01-01', kind: 'deadline', completed: false,
    title: 'Указание', instructionNumber: '23/А', executor: 'Отдел' }]);
});

test('archived calendars show archived deadlines and recorded history, including marks beyond the current deadline', t => {
  const { calendar, plans, create, disablePlanning } = fixture(t);
  const archived = create(plans, { deadline: '2023-01-03', controlSchedule: { frequency: 'daily', firstDate: '2023-01-01',
    marks: [{ date: '2023-01-02', text: 'Отмечено' }, { date: '2024-02-29', text: 'История', actualDate: '2025-01-04' }] } });
  plans.closeControl(archived.id);
  create(plans, {});
  const events = year => calendar.year({ section: 'plans', year, closed: true }).events;
  assert.deepEqual(events(2023).map(({ date, kind, completed }) => [date, kind, completed]), [
    ['2023-01-02', 'checkpoint', true], ['2023-01-03', 'deadline', true],
  ]);
  assert.deepEqual(events(2024).map(({ id, date, kind }) => [id, date, kind]), [[archived.id, '2024-02-29', 'checkpoint']]);
  disablePlanning();
  assert.deepEqual(events(2024), []);
  assert.deepEqual(calendar.year({ section: 'plans', year: 2024, closed: false }), { events: [] });
});

test('annual calendar validates its scope and includes the endpoints of the supported date range', t => {
  const { calendar, instructions, create } = fixture(t);
  for (const date of ['0001-01-01', '9999-12-31']) create(instructions, { controlDate: date, deadline: date });
  const valid = { section: 'instructions', year: 1, closed: false };
  for (const request of [null, {}, { ...valid, section: 'tasks' }, { ...valid, closed: 'false' },
    { ...valid, year: '2024' }, { ...valid, year: 1.1 }, { ...valid, year: 0 }, { ...valid, year: 10000 }]) {
    assert.throws(() => calendar.year(request), { code: 'VALIDATION' });
  }
  assert.deepEqual(calendar.year(valid).events.map(item => item.date), ['0001-01-01']);
  assert.deepEqual(calendar.year({ ...valid, year: 9999 }).events.map(item => item.date), ['9999-12-31']);
});
