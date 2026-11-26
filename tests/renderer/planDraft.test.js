import assert from 'node:assert/strict';
import test from 'node:test';
import { reactive } from 'vue';
import { createPlanDraft, copyPlanDocument, snapshotPlan } from '../../src/renderer/features/planning/planDraft.js';

test('adding a plan row copies the current document and starts an independent empty execution section', () => {
  const document = {
    title: 'План работ', incomingNumber: '12', instructionNumber: 'П-3', documentType: 'План',
    source: 'Отдел', summary: 'Резолюция', executionMark: 'Отметка',
  };
  const first = reactive(createPlanDraft({
    ...document, id: 5, planItem: '1.2', controlDate: '2026-11-02', deadline: '2026-11-05',
    extendedUntil: '2026-11-10', executor: 'Иванов',
    controlSchedule: { frequency: 'custom', firstDate: '', customDates: ['2026-11-04'], marks: [] },
  }));
  const second = copyPlanDocument(first);
  assert.deepEqual(second, {
    ...document, planItem: '', controlDate: '', deadline: '', extendedUntil: '', executor: '',
    controlSchedule: { frequency: '', firstDate: '', customDates: [], marks: [] },
  });
  second.title = 'Изменено';
  second.controlSchedule.customDates.push('2026-12-01');
  const third = copyPlanDocument(second);
  assert.equal(first.title, document.title);
  assert.deepEqual(first.controlSchedule.customDates, ['2026-11-04']);
  assert.equal(third.title, second.title);
  assert.deepEqual(third.controlSchedule.customDates, []);
});

test('a saved plan row retains its item and sends only plain editable data over IPC', () => {
  const form = reactive(createPlanDraft({ id: 2, instructionNumber: 'П-4', planItem: '1.3' }));
  const payload = structuredClone(snapshotPlan(form));
  assert.equal(payload.planItem, '1.3');
  assert.equal(payload.instructionNumber, 'П-4');
  assert.equal(Object.hasOwn(payload, 'id'), false);
  assert.notEqual(payload.controlSchedule, form.controlSchedule);
});
