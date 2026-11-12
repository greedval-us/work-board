import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { CalendarService } from '../../src/main/services/CalendarService.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-checkpoint-changes-'));
  const filePath = path.join(directory, 'registry.sqlite');
  const database = { connection: new DatabaseSync(filePath) };
  migrate(database.connection);
  t.after(() => { database.connection.close(); rmSync(directory, { recursive: true, force: true }); });
  const instructions = new InstructionRepository(database);
  const tasks = new TaskRepository(database);
  const item = instructions.create({
    controlDate: '2026-10-20', incomingNumber: '001/А', instructionNumber: '007/Б',
    title: 'Проверить отчёт', summary: '', deadline: '2026-11-13',
    executor: 'Иванов И. И.', status: 'pending', executionMark: '',
    controlSchedule: { frequency: 'weekly', firstDate: '2026-10-23' },
  });
  return {
    instructions, item, calendar: new CalendarService(instructions, tasks),
    reopen() { database.connection.close(); database.connection = new DatabaseSync(filePath); },
  };
}

test('a saved checkpoint move survives reopening and changes calendar and registry dates without shifting recurrence', t => {
  const { instructions, item, calendar, reopen } = fixture(t);
  const moves = [{ from: '2026-10-30', to: '2026-11-02' }];
  const marks = [{ date: '2026-10-23', actualDate: '2026-10-22', text: 'Первый доклад' }];
  instructions.update(item.id, { controlSchedule: { ...item.controlSchedule, moves, marks } });
  reopen();

  const saved = instructions.get(item.id);
  assert.deepEqual(saved.controlSchedule.moves, moves);
  assert.deepEqual(saved.controlSchedule.marks, marks);
  assert.equal(saved.controlSchedule.firstDate, '2026-10-23');
  assert.equal(saved.deadline, '2026-11-13');
  assert.deepEqual(instructions.list().items.map(row => [row.id, row.nextCheckpoint]), [[item.id, '2026-11-02']]);
  assert.equal(instructions.list({ filters: { checkpoint: 'today' }, today: '2026-10-30' }).total, 0);
  assert.deepEqual(instructions.list({ filters: { checkpoint: 'today' }, today: '2026-11-02' }).items.map(row => [row.id, row.nextCheckpoint]), [[item.id, '2026-11-02']]);
  assert.equal(instructions.list({ filters: { checkpoint: 'overdue' }, today: '2026-11-02' }).total, 0);
  assert.deepEqual(instructions.list({ filters: { checkpoint: 'overdue' }, today: '2026-11-03' }).items.map(row => row.id), [item.id]);

  assert.deepEqual(calendar.day({ date: '2026-10-30' }).checkpoints, []);
  const [moved] = calendar.day({ date: '2026-11-02' }).checkpoints;
  assert.equal(moved.instructionId, item.id);
  assert.equal(moved.date, '2026-11-02');
  assert.equal(moved.originalDate, '2026-10-30');
  assert.equal(moved.scheduled, true);
  assert.deepEqual(calendar.month({ month: '2026-11' }).days.filter(day => day.checkpoints).map(day => [day.date, day.checkpoints]), [
    ['2026-11-02', 1], ['2026-11-06', 1], ['2026-11-13', 1],
  ]);
});

test('a backdated mark on a moved checkpoint persists separately from calendar placement and clears registry work', t => {
  const { instructions, item, calendar, reopen } = fixture(t);
  const marks = [
    { date: '2026-10-23', text: 'Старая отметка' },
    { date: '2026-11-02', actualDate: '2026-10-28', text: 'Доклад получен раньше срока' },
  ];
  instructions.update(item.id, {
    controlSchedule: { ...item.controlSchedule, moves: [{ from: '2026-10-30', to: '2026-11-02' }], marks },
  });
  reopen();

  assert.deepEqual(instructions.get(item.id).controlSchedule.marks, marks);
  assert.equal(instructions.list().items[0].nextCheckpoint, '2026-11-06');
  assert.equal(instructions.list({ filters: { checkpoint: 'today' }, today: '2026-11-02' }).total, 0);
  assert.equal(instructions.list({ filters: { checkpoint: 'overdue' }, today: '2026-11-03' }).total, 0);
  assert.deepEqual(calendar.day({ date: '2026-10-28' }).checkpoints, []);
  assert.deepEqual(calendar.day({ date: '2026-10-30' }).checkpoints, []);
  const [marked] = calendar.day({ date: '2026-11-02' }).checkpoints;
  assert.equal(marked.date, '2026-11-02');
  assert.equal(marked.actualDate, '2026-10-28');
  assert.equal(marked.mark, 'Доклад получен раньше срока');
  assert.equal(marked.scheduled, true);
  const plannedDay = calendar.month({ month: '2026-11' }).days[1];
  assert.equal(plannedDay.checkpoints, 0);
  assert.equal(plannedDay.completedCheckpoints, 1);
});
