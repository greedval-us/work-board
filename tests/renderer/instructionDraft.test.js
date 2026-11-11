import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { createInstructionDraft, snapshotInstruction } from '../../src/renderer/domain/instructions.js';

test('instruction drafts contain only editable fields and start with independent attachment changes', () => {
  const record = { id: 7, title: 'Указание', status: 'pending', createdAt: 'private', attachments: { add: [{ token: 'stale' }], remove: [8] } };
  const first = createInstructionDraft(record);
  const second = createInstructionDraft(record);
  assert.deepEqual(first, {
    controlDate: '', incomingNumber: '', instructionNumber: '', source: '', title: 'Указание', summary: '', deadline: '', extendedUntil: '', executor: '',
    controlType: '', status: 'pending', executionMark: '', controlSchedule: { frequency: '', firstDate: '', customDates: [], marks: [] },
    attachments: { add: [], remove: [] },
  });
  first.attachments.add.push({ token: 'new' });
  first.controlSchedule.marks.push({ date: '2026-10-28', text: 'Отмечено' });
  assert.deepEqual(second.attachments, { add: [], remove: [] });
  assert.deepEqual(second.controlSchedule.marks, []);
});

test('instruction snapshots strip renderer metadata and can cross the structured-clone boundary', () => {
  const draft = reactive({
    id: 7, controlDate: '2026-10-26', incomingNumber: '1', instructionNumber: '2', title: 'Указание', summary: '',
    source: 'Канцелярия', deadline: '2026-10-27', extendedUntil: '2026-11-02', executor: 'Иванов', controlType: 'Плановый', status: 'pending', executionMark: '',
    controlSchedule: { frequency: 'custom', firstDate: '', customDates: ['2026-10-26'], marks: [{ date: '2026-10-26', text: 'Проверено' }] },
    attachments: { add: [{ token: 'selection', name: 'file.txt', size: 1 }], remove: [8] },
  });
  const result = snapshotInstruction(draft);
  const payload = structuredClone(result);
  assert.equal(Object.hasOwn(payload, 'id'), false);
  assert.equal(payload.source, 'Канцелярия');
  assert.equal(payload.extendedUntil, '2026-11-02');
  assert.equal(payload.controlType, 'Плановый');
  draft.controlSchedule.marks[0].text = 'Черновик';
  draft.controlSchedule.customDates.push('2026-10-27');
  assert.deepEqual(payload.controlSchedule, {
    frequency: 'custom', firstDate: '', customDates: ['2026-10-26'], marks: [{ date: '2026-10-26', text: 'Проверено' }],
  });
  assert.deepEqual(payload.attachments, { add: [{ token: 'selection' }], remove: [8] });
  draft.attachments.remove.push(9);
  assert.deepEqual(payload.attachments.remove, [8]);
  assert.equal(Object.hasOwn(snapshotInstruction({ title: 'Draft' }), 'attachments'), false);
});
