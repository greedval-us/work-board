import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { createInstructionDraft, snapshotInstruction } from '../../src/renderer/domain/instructions.js';

test('instruction drafts contain only editable fields and start with independent attachment changes', () => {
  const record = { id: 7, title: 'Указание', status: 'pending', createdAt: 'private', controlType: 'Плановый', attachments: { add: [{ token: 'stale' }], remove: [8] } };
  const first = createInstructionDraft(record);
  const second = createInstructionDraft(record);
  assert.deepEqual(first, {
    controlDate: '', incomingNumber: '', instructionNumber: '', source: '', title: 'Указание', summary: '', deadline: '', extendedUntil: '', executor: '',
    status: 'pending', executionMark: '', controlSchedule: { frequency: '', firstDate: '', customDates: [], marks: [] },
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
  assert.equal(Object.hasOwn(payload, 'controlType'), false);
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

test('checkpoint moves and factual dates survive independent drafts and plain IPC snapshots', () => {
  const record = { controlSchedule: {
    frequency: 'weekly', firstDate: '2026-11-01', customDates: [],
    moves: [{ from: '2026-11-08', to: '2026-11-10', uiState: 'private' }],
    marks: [{ date: '2026-11-10', text: 'Проверено', actualDate: '2026-11-09', uiState: 'private' }],
  } };
  const draft = reactive(createInstructionDraft(record));
  const expected = {
    frequency: 'weekly', firstDate: '2026-11-01', customDates: [],
    moves: [{ from: '2026-11-08', to: '2026-11-10' }],
    marks: [{ date: '2026-11-10', text: 'Проверено', actualDate: '2026-11-09' }],
  };
  assert.deepEqual(structuredClone(snapshotInstruction(draft)).controlSchedule, expected);
  const payload = snapshotInstruction(draft);
  draft.controlSchedule.moves[0].to = '2026-11-11';
  draft.controlSchedule.marks[0].actualDate = '2026-11-07';
  assert.deepEqual(payload.controlSchedule, expected);
  assert.equal(record.controlSchedule.moves[0].to, '2026-11-10');
  assert.equal(record.controlSchedule.marks[0].actualDate, '2026-11-09');
});
