import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { AnalyticsService } from '../../src/main/services/AnalyticsService.js';
import { AnalyticsRepository } from '../../src/main/repositories/AnalyticsRepository.js';

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
test('analytics counts only instructions in totals and monthly execution', t => {
  const result = fixture(t).summary({ filters: { ...filters, entityType: 'tasks', priority: 'urgent' } });
  assert.deepEqual(result.totals, { total: 4, completed: 2, active: 2, pending: 1, inProgress: 1, overdue: 1, completionRate: 50 });
  assert.deepEqual(result.timeline, [{ month: '2026-10', total: 4, completed: 2, active: 2 }]);
  assert.deepEqual(result.filters, { ...filters, status: '', executor: '' });
  assert.equal(result.instructions, null);
});

test('analytics groups executor spelling variants and sorts by total then name', t => {
  const result = fixture(t).summary({ filters });
  assert.deepEqual(result.executors, [
    { key: 'иванов', label: 'Иванов', total: 2, completed: 1, active: 1, overdue: 1 },
    { key: 'белов', label: 'Белов', total: 1, completed: 1, active: 0, overdue: 0 },
    { key: 'петров', label: 'Петров', total: 1, completed: 0, active: 1, overdue: 0 },
  ]);
});

test('analytics matches the exact executor key in totals and instructions', t => {
  const service = fixture(t, instructions => {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Другое указание', deadline: '2026-10-25', executor: 'Иванова' });
  });
  const result = service.summary({ filters: { ...filters, executor: 'иванов', status: 'active' } });
  assert.equal(result.totals.total, 1);
  assert.equal(result.filters.executor, 'иванов');
  assert.deepEqual(result.executors, [{ key: 'иванов', label: 'Иванов', total: 1, completed: 0, active: 1, overdue: 1 }]);
  assert.deepEqual(result.timeline, [{ month: '2026-10', total: 1, completed: 0, active: 1 }]);
  assert.deepEqual(result.instructions, {
    items: [{ id: 1, instructionNumber: '1', title: 'Указание', deadline: '2026-10-25', extendedUntil: '', status: 'in_progress' }],
    page: 1,
    pageCount: 1,
  });
});

test('analytics offers every historical executor once regardless of filters', t => {
  const service = fixture(t);
  const result = service.summary({ filters: { ...filters, executor: 'иванов', status: 'completed' } });
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
  const service = fixture(t, instructions => {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '2', title: 'Исполнено', deadline: '2026-11-03', executor: 'Сидоров', status: 'completed' });
  });
  const result = service.summary({ filters: { from: '2026-11-02', to: '2026-11-30', executor: 'сидоров', status: 'pending' } });
  assert.equal(result.totals.total, 1);
  assert.equal(result.totals.overdue, 0);
  assert.deepEqual(result.executors, [{ key: 'сидоров', label: 'Сидоров', total: 1, completed: 0, active: 1, overdue: 0 }]);
  assert.deepEqual(result.timeline, [{ month: '2026-11', total: 1, completed: 0, active: 1 }]);
  assert.deepEqual(result.instructions?.items, [
    { id: 4, instructionNumber: '1', title: 'Указание', deadline: '2026-10-03', extendedUntil: '2026-11-02', status: 'pending' },
  ]);
  const october = service.summary({ filters: { ...filters, executor: 'сидоров', status: 'pending' }, page: 10 });
  assert.deepEqual(october.instructions, { items: [], page: 1, pageCount: 1 });
});

test('analytics paginates matching instructions by effective deadline and ID', t => {
  const service = fixture(t, instructions => {
    const draft = { controlDate: '2026-09-01', instructionNumber: '2', title: 'Указание', executor: 'Иванов' };
    instructions.create({ ...draft, deadline: '2026-10-20', extendedUntil: '2026-10-25' });
    for (let index = 0; index < 24; index++) instructions.create({ ...draft, deadline: '2026-10-24' });
  });
  const request = { filters: { ...filters, executor: 'иванов', status: 'active' } };
  const first = service.summary(request);
  assert.equal(first.totals.total, 26);
  assert.equal(first.instructions?.page, 1);
  assert.equal(first.instructions.pageCount, 2);
  assert.deepEqual(first.instructions.items.map(item => item.id), [...Array.from({ length: 24 }, (_, index) => index + 7), 1]);
  const last = service.summary({ ...request, page: 99 });
  assert.equal(last.instructions.page, 2);
  assert.equal(last.instructions.pageCount, 2);
  assert.deepEqual(last.instructions.items.map(item => item.id), [6]);
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
  assert.throws(() => service.summary({ filters: { status: "'; DROP TABLE instructions; --" } }), /статус/i);
  assert.equal(service.summary({ filters: { executor: '%' } }).totals.total, 0);
  const empty = service.summary({ filters: { from: '2000-01-01', to: '2000-01-31' } });
  assert.equal(empty.totals.completionRate, 0);
  assert.deepEqual(empty.timeline, []);
  assert.deepEqual(empty.executors, []);
});
