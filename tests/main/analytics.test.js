import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { AnalyticsService } from '../../src/main/services/AnalyticsService.js';
import { AnalyticsRepository } from '../../src/main/repositories/AnalyticsRepository.js';

function fixture(t) {
  const connection = new DatabaseSync(':memory:'); migrate(connection); t.after(() => connection.close());
  const database = { connection }; const tasks = new TaskRepository(database); const instructions = new InstructionRepository(database);
  tasks.create({ title: 'Выполнена', date: '2026-10-01', priority: 'urgent', completed: true });
  tasks.create({ title: 'Важная', date: '2026-10-26', priority: 'important' });
  tasks.create({ title: 'За периодом', date: '2026-11-01' });
  for (const [status, deadline, executor] of [['in_progress', '2026-10-25', 'Иванов'], ['pending', '2026-10-26', 'Петров'], ['completed', '2026-10-02', 'ИВАНОВ']]) {
    instructions.create({ controlDate: '2026-09-01', instructionNumber: '1', title: 'Указание', deadline, executor, status });
  }
  return new AnalyticsService({ repository: new AnalyticsRepository(database), today: () => '2026-10-26' });
}
const filters = { from: '2026-10-01', to: '2026-10-26' };
test('analytics aggregates every matching row, statuses, overdue and monthly execution', t => {
  const service = fixture(t); const result = service.summary({ filters });
  assert.deepEqual(result.totals, { total: 5, completed: 2, active: 3, pending: 1, inProgress: 1, activeTasks: 1, overdue: 1, completionRate: 40 });
  assert.equal(result.timeline.length, 1); assert.deepEqual(result.timeline[0], { month: '2026-10', total: 5, completed: 2, active: 3 });
  assert.equal(result.priorities.find(row => row.key === 'important').total, 1);
  assert.equal(service.summary({ filters: { ...filters, entityType: 'tasks', priority: 'urgent' } }).totals.completed, 1);
  assert.equal(service.summary({ filters: { ...filters, entityType: 'instructions', executor: 'иванов', status: 'in_progress' } }).totals.total, 1);
  assert.equal(service.summary({ filters: { ...filters, status: 'active' } }).totals.total, 3);
});
test('analytics validates filters, treats searches literally and supports empty data', t => {
  const service = fixture(t);
  assert.throws(() => service.summary({ filters: { from: '2026-10-30', to: '2026-10-01' } }), /период/i);
  assert.throws(() => service.summary({ filters: { status: "'; DROP TABLE instructions; --" } }), /статус/i);
  assert.throws(() => service.summary({ filters: { priority: 'bad' } }), /важност/i);
  assert.equal(service.summary({ filters: { executor: '%' } }).totals.total, 0);
  const empty = service.summary({ filters: { from: '2000-01-01', to: '2000-01-31' } });
  assert.equal(empty.totals.completionRate, 0); assert.deepEqual(empty.timeline, []);
});
