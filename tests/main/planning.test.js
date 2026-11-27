import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { inspectConnection } from '../../src/main/database/inspectDatabase.js';
import { DATABASE_CONFIG } from '../../src/main/database/databaseConfig.js';
import { migrate, migrations } from '../../src/main/database/migrations.js';
import { runTransaction } from '../../src/main/database/transaction.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';
import { PlanningService } from '../../src/main/services/PlanningService.js';

function fixture(t) {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  const database = { connection, transaction: operation => runTransaction(connection, operation) };
  const repository = new PlanRepository(database);
  return { database, repository, plans: new PlanningService({ database, repository }), instructions: new InstructionRepository(database) };
}

function row(instructionNumber, planItem, extra = {}) {
  return { instructionNumber, planItem, controlDate: '2026-11-01', title: 'План проверок',
    deadline: '2026-12-01', executor: 'Иванов', ...extra };
}

test('planning migrates separately and a version 11 database requires the plan table', t => {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  for (const migration of migrations.filter(m => m.version <= 10)) connection.exec(migration.sql);
  connection.exec('PRAGMA user_version = 10');
  migrate(connection);
  assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM plans').get().count, 0);
  assert.equal(inspectConnection(connection).needsWrite, false);
  connection.exec('DROP TABLE plans');
  assert.throws(() => inspectConnection(connection), { code: 'DATABASE_INVALID' });
});

test('batch plan edits, closures and deletions leave instructions with the same ID intact', t => {
  const { plans, instructions } = fixture(t);
  const instruction = instructions.create(row('Реестр', ''));
  const [first, second] = plans.create({ rows: [
    row('17/А', 'п. 1', { activity: 'Сверка' }), row('17/А', 'п. 2', { activity: 'Анализ' }),
  ] });
  assert.deepEqual(plans.list({ sort: { field: 'activity', direction: 'asc' } }).items.map(item => item.activity), ['Анализ', 'Сверка']);
  assert.equal(instruction.id, first.id);
  assert.equal(plans.get({ id: second.id }).planItem, 'п. 2');
  plans.update({ id: first.id, data: { planItem: 'п. 1.1' } });
  assert.equal(plans.get({ id: first.id }).activity, 'Сверка');
  plans.update({ id: first.id, data: { activity: 'Отчёт' } });
  assert.equal(plans.get({ id: first.id }).activity, 'Отчёт');
  assert.equal(plans.get({ id: first.id }).planItem, 'п. 1.1');
  plans.closeControl({ id: second.id });
  assert.deepEqual(plans.list({ closed: true }).items.map(item => item.id), [second.id]);
  plans.remove({ id: first.id });
  assert.equal(plans.list().total, 0);
  assert.deepEqual(instructions.get(instruction.id), instruction);
});

test('an existing signed v11 database keeps plan data and initializes activity during migration', t => {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  for (const migration of migrations.filter(m => m.version <= 11)) connection.exec(migration.sql);
  connection.exec(`PRAGMA application_id = ${DATABASE_CONFIG.APPLICATION_ID}; PRAGMA user_version = 11;
    INSERT INTO plans (id, control_date, instruction_number, title, plan_item, deadline, executor,
      instruction_number_search, document_type_search, executor_search, execution_mark_search, created_at, updated_at)
    VALUES (12, '2026-11-01', '17/А', 'План', '2.1', '2026-12-01', 'Иванов', '17/а', '', 'иванов', '', '2026-11-01', '2026-11-01')`);
  assert.equal(inspectConnection(connection).needsWrite, true);
  migrate(connection);
  assert.equal(inspectConnection(connection).needsWrite, false);
  const plans = new PlanRepository({ connection });
  const previous = plans.get(12);
  assert.deepEqual([previous.planItem, previous.title, previous.activity], ['2.1', 'План', '']);
  assert.equal(plans.update(12, { activity: 'Подготовить отчёт' }).activity, 'Подготовить отчёт');
  migrate(connection);
  assert.equal(plans.get(12).activity, 'Подготовить отчёт');
  connection.exec('ALTER TABLE plans DROP COLUMN activity');
  assert.throws(() => inspectConnection(connection), { code: 'DATABASE_INVALID' });
});

test('a failed plan batch rolls back all its rows', t => {
  const { plans, database } = fixture(t);
  database.connection.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON plans WHEN NEW.plan_item = 'п. 2'
    BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);
  assert.throws(() => plans.create({ rows: [row('17/А', 'п. 1'), row('17/А', 'п. 2')] }), /test write failure/);
  assert.equal(plans.list().total, 0);
  assert.throws(() => plans.create({ rows: [] }), { code: 'VALIDATION' });
});

test('pagination returns complete signature groups across batches, and filters apply before pagination', t => {
  const { plans, repository } = fixture(t);
  const [first, other, later] = plans.create({ rows: [
    row('17/А', 'а', { documentType: 'Акт' }),
    row('18/Б', 'б', { documentType: 'Письмо' }),
    row('19/В', 'в', { documentType: 'Письмо' }),
  ] });
  const [last] = plans.create({ rows: [row(' 17/а ', 'г', { executor: 'Петров' })] });
  const request = { sort: { field: 'planItem', direction: 'asc' }, limit: 1 };
  const page = plans.list(request);
  assert.deepEqual(page.items.map(item => item.id), [first.id, last.id]);
  assert.deepEqual(page.documentTypes, ['Акт', 'Письмо']);
  assert.equal(page.total, 3);
  assert.deepEqual(plans.list({ ...request, offset: 1 }).items.map(item => item.id), [other.id]);
  assert.deepEqual(repository.all(request).map(item => item.id), [first.id, last.id, other.id, later.id]);
  const filtered = plans.list({ ...request, filters: { executor: 'петр' } });
  assert.equal(filtered.total, 1);
  assert.deepEqual(filtered.items.map(item => item.id), [last.id]);
});
