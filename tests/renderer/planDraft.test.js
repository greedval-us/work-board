import assert from 'node:assert/strict';
import test from 'node:test';
import { reactive } from 'vue';
import { createPlanDraft, snapshotPlan } from '../../src/renderer/features/planning/planDraft.js';

test('a plan batch shares the latest first-row document but keeps each activity, mark and execution separate', () => {
  const first = reactive(createPlanDraft({
    id: 5, title: 'План работ', incomingNumber: '12', instructionNumber: 'П-3', documentType: 'План',
    source: 'Отдел', summary: 'Резолюция', activity: 'Провести осмотр', executionMark: 'Готово',
    planItem: '1.2', controlDate: '2026-11-02', deadline: '2026-11-05', extendedUntil: '2026-11-10', executor: 'Иванов',
    controlSchedule: { frequency: 'custom', firstDate: '', customDates: ['2026-11-04'], marks: [] },
  }));
  const second = reactive(createPlanDraft());
  assert.deepEqual([second.activity, second.executionMark, second.planItem, second.executor, second.deadline], ['', '', '', '', '']);
  Object.assign(second, { planItem: '1.3', activity: 'Подготовить акт', executionMark: 'Согласовано', executor: 'Козлов' });
  first.instructionNumber = 'П-4';
  first.summary = 'Уточнено';
  const payload = structuredClone(snapshotPlan(second, first));
  assert.deepEqual(payload, {
    title: first.title, incomingNumber: first.incomingNumber, instructionNumber: 'П-4', documentType: first.documentType,
    source: first.source, summary: 'Уточнено', planItem: '1.3', activity: 'Подготовить акт', executionMark: 'Согласовано',
    executor: 'Козлов', controlDate: '', deadline: '', extendedUntil: '',
    controlSchedule: { frequency: '', firstDate: '', customDates: [], marks: [] },
  });
  assert.deepEqual(first.controlSchedule.customDates, ['2026-11-04']);
  assert.equal(first.activity, 'Провести осмотр');
});

test('a single plan draft retains its saved activity and defaults older plans to an empty field', () => {
  const form = reactive(createPlanDraft({ id: 2, instructionNumber: 'П-4', planItem: '1.3', activity: 'Сверить отчёт' }));
  const payload = structuredClone(snapshotPlan(form));
  assert.equal(payload.activity, 'Сверить отчёт');
  assert.equal(payload.planItem, '1.3');
  assert.equal(payload.instructionNumber, 'П-4');
  assert.equal(Object.hasOwn(payload, 'id'), false);
  assert.notEqual(payload.controlSchedule, form.controlSchedule);
  assert.equal(createPlanDraft({ id: 4 }).activity, '');
});
