import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { AnalyticsService } from '../../src/main/services/AnalyticsService.js';
import { AnalyticsRepository } from '../../src/main/repositories/AnalyticsRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';

test('planning analytics counts only plan deadlines and checkpoints and links each detail to its plan item', t => {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  const database = { connection };
  const plans = new PlanRepository(database);
  const row = { instructionNumber: 'П-7', title: 'Ноябрь', controlDate: '2026-11-01', executor: 'Иванов', deadline: '2026-11-30' };
  new InstructionRepository(database).create({ ...row, executor: 'Сидоров' });
  const first = plans.create({ ...row, planItem: '1.1', controlSchedule: { frequency: 'custom', customDates: ['2026-11-24'] } });
  const closed = plans.closeControl(plans.create({ ...row, planItem: '1.2' }).id);
  const service = new AnalyticsService({ repository: new AnalyticsRepository(database, { planning: true }),
    detailKey: 'plans', today: () => '2026-11-26' });
  assert.equal(service.summary().totals.total, 3);
  assert.deepEqual(service.summary().executorOptions.map(option => option.label), ['Иванов']);
  const result = service.summary({ filters: { executor: 'иванов' } });
  assert.deepEqual(result.totals, { total: 3, active: 2, overdue: 1, closed: 1, closedRate: 33 });
  assert.deepEqual(result.plans.items.map(item => [item.id, item.planItem, item.checkpointDate ?? '', Boolean(item.closedAt)]), [
    [first.id, '1.1', '2026-11-24', false], [first.id, '1.1', '', false], [closed.id, '1.2', '', true],
  ]);
  assert.equal(new AnalyticsService({ repository: new AnalyticsRepository(database) }).summary().totals.total, 1);
});

function fixture(t, seed) {
  const connection = new DatabaseSync(':memory:'); migrate(connection); t.after(() => connection.close());
  const database = { connection }; const tasks = new TaskRepository(database); const instructions = new InstructionRepository(database);
  tasks.create({ title: 'Выполнена', date: '2026-10-01', priority: 'urgent', completed: true });
  tasks.create({ title: 'Важная', date: '2026-10-26', priority: 'important' });
  tasks.create({ title: 'За периодом', date: '2026-11-01' });
  for (const [status, deadline, executor, extendedUntil] of [
    ['in_progress', '2026-10-25', 'Иванов'],
    ['pending', '2026-10-26', 'Петров'],
    ['completed', '2026-10-02', 'ИВАНОВ'],
    ['pending', '2026-10-03', 'Сидоров', '2026-11-02'],
    ['completed', '2026-10-01', 'Белов'],
  ]) {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '1', title: 'Указание', deadline, executor, status, extendedUntil });
  }
  seed?.(instructions, connection);
  return new AnalyticsService({ repository: new AnalyticsRepository(database), today: () => '2026-10-26' });
}
const filters = { from: '2026-10-01', to: '2026-10-26' };
test('analytics excludes personal tasks from totals and monthly control', t => {
  const result = fixture(t).summary({ filters: { ...filters, entityType: 'tasks', priority: 'urgent' } });
  assert.deepEqual(result.totals, { total: 4, closed: 0, active: 4, overdue: 3, closedRate: 0 });
  assert.deepEqual(result.timeline, [{ month: '2026-10', total: 4, closed: 0, active: 4 }]);
  assert.deepEqual(result.filters, { ...filters, executor: '' });
  assert.equal(result.instructions, null);
});

test('analytics counts scheduled, moved and marked checkpoints by their own dates and executor', t => {
  let instruction;
  const service = fixture(t, instructions => {
    instruction = instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'График контроля',
      deadline: '2026-10-26', extendedUntil: '2026-11-02', executor: 'Контролёр', controlSchedule: {
        frequency: 'custom', customDates: ['2026-10-03', '2026-10-10', '2026-10-25', '2026-10-26', '2026-11-01'],
        moves: [{ from: '2026-10-10', to: '2026-10-15' }],
        marks: [{ date: '2026-10-15', text: 'Готово', actualDate: '2026-11-01' }, { date: '2026-10-22', text: 'Выполнено' }],
      } });
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '3', title: 'Другой исполнитель', deadline: '2026-11-02',
      executor: 'Контролёр 2', controlSchedule: { frequency: 'custom', customDates: ['2026-10-17'] } });
  });
  const current = service.summary({ filters: { ...filters, executor: 'контролёр' } });
  assert.deepEqual(current.totals, { total: 5, closed: 2, active: 3, overdue: 2, closedRate: 40 });
  assert.deepEqual(current.timeline, [{ month: '2026-10', total: 5, closed: 2, active: 3 }]);
  assert.deepEqual(current.executors, [{ key: 'контролёр', label: 'Контролёр', total: 5, closed: 2, active: 3, overdue: 2 }]);
  assert.deepEqual(current.instructions.items.map(({ id, checkpointDate, checkpointClosed }) => [id, checkpointDate, checkpointClosed]), [
    [instruction.id, '2026-10-03', false], [instruction.id, '2026-10-15', true], [instruction.id, '2026-10-22', true],
    [instruction.id, '2026-10-25', false], [instruction.id, '2026-10-26', false],
  ]);
  const november = service.summary({ filters: { from: '2026-11-01', to: '2026-11-02', executor: 'контролёр' } });
  assert.deepEqual(november.instructions.items.map(item => item.checkpointDate ?? item.extendedUntil), ['2026-11-01', '2026-11-02']);
});

test('analytics counts marked history from closed instructions and omits canceled checkpoints', t => {
  const closedAt = '2026-10-26T12:00:00.000Z';
  const service = fixture(t, (instructions, connection) => {
    const item = instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Закрытый график',
      deadline: '2026-11-02', executor: 'Контролёр', controlSchedule: { frequency: 'daily', firstDate: '2026-10-24',
        marks: [{ date: '2026-10-25', text: '  Выполнено  ' }] } });
    connection.prepare('UPDATE instructions SET closed_at = ? WHERE id = ?').run(closedAt, item.id);
  });
  const result = service.summary({ filters: { ...filters, executor: 'контролёр' } });
  assert.deepEqual(result.totals, { total: 1, closed: 1, active: 0, overdue: 0, closedRate: 100 });
  assert.deepEqual(result.instructions.items.map(({ checkpointDate, checkpointClosed, closedAt: timestamp }) => [checkpointDate, checkpointClosed, timestamp]),
    [['2026-10-25', true, closedAt]]);
});

test('analytics expands dates by period and paginates controls by date and instruction', t => {
  let daily;
  let monthly;
  const service = fixture(t, instructions => {
    daily = instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Ежедневный график',
      deadline: '2026-11-01', executor: 'Контролёр', controlSchedule: { frequency: 'daily', firstDate: '2026-10-09' } });
    monthly = instructions.create({ controlDate: '2026-09-01', instructionNumber: '3', title: 'График по периодам',
      deadline: '2026-11-02', executor: 'КОНТРОЛЁР', controlSchedule: { frequency: 'monthly', periodDates: { '2026-10-01': '2026-10-15' } } });
  });
  const request = { filters: { executor: 'контролёр' } };
  const first = service.summary(request);
  const second = service.summary({ ...request, page: 100 });
  assert.deepEqual(first.timeline, [
    { month: '2026-10', total: 24, closed: 0, active: 24 }, { month: '2026-11', total: 3, closed: 0, active: 3 },
  ]);
  assert.equal(first.totals.total, 27);
  assert.equal(first.instructions.items.length, 25);
  assert.ok(first.instructions.items.some(item => item.id === monthly.id && item.checkpointDate === '2026-10-15'));
  assert.equal(first.instructions.items[24].checkpointDate, undefined);
  assert.equal(first.instructions.items[24].id, daily.id);
  assert.deepEqual(second.instructions.items.map(({ id, checkpointDate }) => [id, checkpointDate]),
    [[daily.id, '2026-11-01'], [monthly.id, undefined]]);
  assert.equal(second.instructions.pageCount, 2);
  assert.equal(second.instructions.page, 2);
});

test('analytics groups executor spelling variants and sorts by total then name', t => {
  const result = fixture(t).summary({ filters });
  assert.deepEqual(result.executors, [
    { key: 'иванов', label: 'Иванов', total: 2, closed: 0, active: 2, overdue: 2 },
    { key: 'белов', label: 'Белов', total: 1, closed: 0, active: 1, overdue: 1 },
    { key: 'петров', label: 'Петров', total: 1, closed: 0, active: 1, overdue: 0 },
  ]);
});

test('analytics keeps closed instructions in history without counting them as active or overdue', t => {
  const closedAt = '2026-10-26T12:00:00.000Z';
  const service = fixture(t, (_instructions, connection) => {
    connection.prepare('UPDATE instructions SET closed_at = ? WHERE id IN (1, 3)').run(closedAt);
  });
  const result = service.summary({ filters });
  assert.deepEqual(result.totals, { total: 4, closed: 2, active: 2, overdue: 1, closedRate: 50 });
  assert.deepEqual(result.timeline, [{ month: '2026-10', total: 4, closed: 2, active: 2 }]);
  assert.deepEqual(result.executors.find(row => row.key === 'иванов'), {
    key: 'иванов', label: 'Иванов', total: 2, closed: 2, active: 0, overdue: 0,
  });
  const history = service.summary({ filters: { ...filters, executor: 'иванов' } });
  assert.deepEqual(history.instructions.items.map(({ id, closedAt: timestamp }) => [id, timestamp]), [
    [3, closedAt], [1, closedAt],
  ]);
  assert.deepEqual(service.summary({ filters: { ...filters, executor: 'иванов', status: 'active' } }), history);
});

test('analytics matches the exact executor key in totals and instructions', t => {
  const service = fixture(t, instructions => {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Другое указание', deadline: '2026-10-25', executor: 'Иванова' });
  });
  const result = service.summary({ filters: { ...filters, executor: 'иванов' } });
  assert.equal(result.totals.total, 2);
  assert.equal(result.filters.executor, 'иванов');
  assert.deepEqual(result.executors, [{ key: 'иванов', label: 'Иванов', total: 2, closed: 0, active: 2, overdue: 2 }]);
  assert.deepEqual(result.timeline, [{ month: '2026-10', total: 2, closed: 0, active: 2 }]);
  assert.deepEqual(result.instructions, {
    items: [
      { id: 3, instructionNumber: '1', title: 'Указание', deadline: '2026-10-02', extendedUntil: '', closedAt: null },
      { id: 1, instructionNumber: '1', title: 'Указание', deadline: '2026-10-25', extendedUntil: '', closedAt: null },
    ],
    page: 1,
    pageCount: 1,
  });
});

test('analytics offers every historical executor once regardless of filters', t => {
  const service = fixture(t);
  const result = service.summary({ filters: { ...filters, executor: 'иванов' } });
  assert.deepEqual(result.executorOptions, [
    { key: 'белов', label: 'Белов' },
    { key: 'иванов', label: 'Иванов' },
    { key: 'петров', label: 'Петров' },
    { key: 'сидоров', label: 'Сидоров' },
  ]);
});

test('analytics preserves whitespace in historical executor keys', t => {
  const service = fixture(t, (_instructions, connection) => {
    connection.prepare('UPDATE instructions SET executor = ?, executor_search = ? WHERE id = 1').run(' Иванов ', ' иванов ');
  });
  const result = service.summary({ filters: { executor: ' иванов ' } });
  assert.equal(result.filters.executor, ' иванов ');
  assert.equal(result.totals.total, 1);
  assert.deepEqual(result.instructions.items.map(item => item.id), [1]);
});

test('analytics uses the historical option key verbatim for names with combining characters', t => {
  const label = 'J\u030Can';
  const service = fixture(t, instructions => {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Доклад', deadline: '2026-10-25', executor: label });
  });
  const { key } = service.summary().executorOptions.find(option => option.label === label);
  const result = service.summary({ filters: { executor: key } });
  assert.equal(result.filters.executor, key);
  assert.equal(result.totals.total, 1);
  assert.deepEqual(result.instructions.items.map(item => item.title), ['Доклад']);
});

test('analytics uses the extended deadline for the period and overdue calculation', t => {
  const service = fixture(t);
  const result = service.summary({ filters: { from: '2026-11-02', to: '2026-11-30', executor: 'сидоров' } });
  assert.equal(result.totals.total, 1);
  assert.equal(result.totals.overdue, 0);
  assert.deepEqual(result.executors, [{ key: 'сидоров', label: 'Сидоров', total: 1, closed: 0, active: 1, overdue: 0 }]);
  assert.deepEqual(result.timeline, [{ month: '2026-11', total: 1, closed: 0, active: 1 }]);
  assert.deepEqual(result.instructions?.items, [
    { id: 4, instructionNumber: '1', title: 'Указание', deadline: '2026-10-03', extendedUntil: '2026-11-02', closedAt: null },
  ]);
  const october = service.summary({ filters: { ...filters, executor: 'сидоров' }, page: 10 });
  assert.deepEqual(october.instructions, { items: [], page: 1, pageCount: 1 });
});

test('analytics paginates matching instructions by effective deadline and ID', t => {
  const service = fixture(t, instructions => {
    const draft = { controlDate: '2026-09-01', instructionNumber: '2', title: 'Указание', executor: 'Иванов' };
    instructions.create({ ...draft, deadline: '2026-10-20', extendedUntil: '2026-10-25' });
    for (let index = 0; index < 24; index++) instructions.create({ ...draft, deadline: '2026-10-24' });
  });
  const request = { filters: { ...filters, executor: 'иванов' } };
  const first = service.summary(request);
  assert.equal(first.totals.total, 27);
  assert.equal(first.instructions?.page, 1);
  assert.equal(first.instructions.pageCount, 2);
  assert.deepEqual(first.instructions.items.map(item => item.id), [3, ...Array.from({ length: 24 }, (_, index) => index + 7)]);
  const last = service.summary({ ...request, page: 99 });
  assert.equal(last.instructions.page, 2);
  assert.equal(last.instructions.pageCount, 2);
  assert.deepEqual(last.instructions.items.map(item => item.id), [1, 6]);
});

test('analytics rejects a page outside the positive safe integer range', t => {
  const service = fixture(t);
  for (const page of [0, -1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => service.summary({ page }), /страниц/i);
  }
});

test('analytics validates filters, treats executor keys literally and supports empty data', t => {
  const service = fixture(t);
  assert.throws(() => service.summary({ filters: { from: '2026-10-30', to: '2026-10-01' } }), /период/i);
  assert.throws(() => service.summary({ filters: { executor: false } }), /фильтры/i);
  assert.equal(service.summary({ filters: { executor: '%' } }).totals.total, 0);
  const empty = service.summary({ filters: { from: '2000-01-01', to: '2000-01-31' } });
  assert.equal(empty.totals.closedRate, 0);
  assert.deepEqual(empty.timeline, []);
  assert.deepEqual(empty.executors, []);
});
