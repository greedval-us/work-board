import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { migrate } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { CalendarService } from '../../src/main/services/CalendarService.js';

test('the calendar keeps plan deadlines and checkpoints distinct and follows the live planning setting', t => {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  const database = { connection };
  const instructions = new InstructionRepository(database);
  const plans = new PlanRepository(database);
  let enabled = true;
  const calendar = new CalendarService(instructions, new TaskRepository(database), { plans, isPlanningEnabled: () => enabled });
  const date = '2026-11-30';
  const data = {
    title: 'Работы', instructionNumber: '11', executor: 'Отдел', controlDate: '2026-11-01', deadline: date,
    controlSchedule: { frequency: 'custom', customDates: [date] },
  };
  const instruction = instructions.create(data);
  const plan = plans.create({ ...data, planItem: 'Пункт А', activity: 'Подготовить доклад' });
  assert.equal(instruction.id, plan.id);
  const second = plans.create({ ...data, planItem: 'Пункт Б', extendedUntil: '2026-12-01', status: 'completed',
    controlSchedule: { ...data.controlSchedule, marks: [{ date, text: 'Доклад получен' }] } });
  const day = () => calendar.day({ date });
  const lastDay = () => calendar.month({ month: '2026-11' }).days.at(-1);
  assert.deepEqual(day().plans.map(({ id }) => id), [plan.id]);
  assert.equal(day().plans[0].activity, 'Подготовить доклад');
  assert.equal(day().planCheckpoints[0].activity, 'Подготовить доклад');
  assert.deepEqual(day().planCheckpoints.map(item => [item.planId, item.planItem, item.mark]), [
    [plan.id, 'Пункт А', ''], [second.id, 'Пункт Б', 'Доклад получен'],
  ]);
  assert.equal(day().checkpoints[0].instructionId, instruction.id);
  assert.deepEqual(lastDay(), { date, controls: 1, completedControls: 0, tasks: 0, completedTasks: 0, checkpoints: 1,
    completedCheckpoints: 0, plans: 1, completedPlans: 0, planCheckpoints: 1, completedPlanCheckpoints: 1 });
  assert.equal(calendar.month({ month: '2026-12' }).days[0].completedPlans, 1);
  plans.update(second.id, { controlSchedule: data.controlSchedule });
  assert.equal(day().planCheckpoints.find(row => row.planId === second.id).recordCompleted, true);
  assert.equal(lastDay().planCheckpoints, 2);
  assert.equal(lastDay().inactivePlanCheckpoints, 1);
  plans.closeControl(plan.id);
  assert.deepEqual(day().plans, []);
  assert.equal(day().planCheckpoints.length, 1);
  enabled = false;
  assert.equal(day().planCheckpoints?.length ?? 0, 0);
  assert.equal(lastDay().completedPlanCheckpoints ?? 0, 0);
  assert.equal(day().instructions.length, 1);
  enabled = true;
  assert.equal(day().planCheckpoints[0].planItem, 'Пункт Б');
});
