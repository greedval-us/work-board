import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { migrate } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';

function fixture(t, Repository) {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  const repository = new Repository({ connection });
  const create = data => repository.create({
    controlDate: '2026-11-01', instructionNumber: '12/А', title: 'Проверка',
    incomingNumber: '017', executor: 'Отдел', planItem: 'п. 1', deadline: '2026-11-20', ...data,
  });
  return { create, repository };
}

for (const Repository of [InstructionRepository, PlanRepository]) {
  test(`${Repository.name} reports each overdue active control on the date it is currently due`, t => {
    const { create, repository } = fixture(t, Repository);
    const first = create({
      deadline: '2026-11-04', extendedUntil: '2026-11-09', status: 'in_progress',
      controlSchedule: { frequency: 'custom', customDates: ['2026-11-02', '2026-11-03', '2026-11-09'],
        marks: [{ date: '2026-11-03', text: 'Проверено', actualDate: '2026-11-05' }],
        moves: [{ from: '2026-11-02', to: '2026-11-06' }] },
    });
    const second = create({ deadline: '2026-11-09' });
    const extended = create({ deadline: '2026-11-03', extendedUntil: '2026-11-19',
      controlSchedule: { frequency: 'custom', customDates: ['2026-11-07', '2026-11-08', '2026-11-10'],
        moves: [{ from: '2026-11-07', to: '2026-11-11' }] } });
    create({ deadline: '2026-11-10' });
    const inactive = { deadline: '2026-11-09', controlSchedule: { frequency: 'daily', firstDate: '2026-11-01' } };
    repository.closeControl(create(inactive).id);
    create({ ...inactive, status: 'completed' });
    const rows = repository.overdueControls('2026-11-10');
    assert.deepEqual(rows.map(row => [row.id, row.controlKind, row.dueDate]), [
      [first.id, 'checkpoint', '2026-11-06'], [extended.id, 'checkpoint', '2026-11-08'],
      [first.id, 'deadline', '2026-11-09'], [first.id, 'checkpoint', '2026-11-09'], [second.id, 'deadline', '2026-11-09'],
    ]);
    assert.equal(rows[0].instructionNumber, '12/А');
    if (Repository === PlanRepository) assert.equal(rows[0].planItem, 'п. 1');
    assert.deepEqual(repository.overdueControls('0001-01-01'), []);
    assert.throws(() => repository.overdueControls('2026-02-30'), { code: 'VALIDATION' });
  });
}

test('old daily schedules include every past year through yesterday and honor period overrides', t => {
  const { create, repository } = fixture(t, InstructionRepository);
  create({ controlDate: '2016-01-01', deadline: '2026-01-01',
    controlSchedule: { frequency: 'daily', firstDate: '2016-01-01', periodDates: { '2020-02-29': '' } } });
  const rows = repository.overdueControls('2026-01-01');
  assert.equal(rows.length, 3652); // Ten years include three leap days; one checkpoint was canceled.
  assert.equal(rows[0].dueDate, '2016-01-01');
  assert.equal(rows.at(-1).dueDate, '2025-12-31');
  assert.ok(rows.every(row => row.controlKind === 'checkpoint' && row.dueDate !== '2020-02-29'));
});
