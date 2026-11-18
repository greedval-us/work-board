import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { createInstructionDraft, snapshotInstruction } from '../../src/renderer/features/registry/instructionDraft.js';

test('instruction drafts contain only editable fields and have independent schedules', () => {
  const record = { id: 7, title: 'Указание', status: 'pending', createdAt: 'private', controlType: 'Плановый', attachments: { add: [{ token: 'stale' }], remove: [8] } };
  const first = createInstructionDraft(record);
  const second = createInstructionDraft(record);
  assert.deepEqual(first, {
    controlDate: '', incomingNumber: '', instructionNumber: '', documentType: '', source: '', title: 'Указание', summary: '', deadline: '', extendedUntil: '', executor: '',
    executionMark: '', controlSchedule: { frequency: '', firstDate: '', customDates: [], marks: [] },
  });
  first.controlSchedule.marks.push({ date: '2026-10-28', text: 'Отмечено' });
  assert.deepEqual(second.controlSchedule.marks, []);
});

test('instruction snapshots strip renderer metadata and can cross the structured-clone boundary', () => {
  const draft = reactive({
    id: 7, controlDate: '2026-10-26', incomingNumber: '1', instructionNumber: '2', title: 'Указание', summary: '',
    documentType: 'Приказ', source: 'Канцелярия', deadline: '2026-10-27', extendedUntil: '2026-11-02', executor: 'Иванов', controlType: 'Плановый', status: 'pending', executionMark: '',
    controlSchedule: { frequency: 'custom', firstDate: '', customDates: ['2026-10-26'], marks: [{ date: '2026-10-26', text: 'Проверено' }] },
    attachments: { add: [{ token: 'selection', name: 'file.txt', size: 1 }], remove: [8] },
  });
  const result = snapshotInstruction(draft);
  const payload = structuredClone(result);
  assert.equal(Object.hasOwn(payload, 'id'), false);
  assert.equal(payload.documentType, 'Приказ');
  assert.equal(payload.source, 'Канцелярия');
  assert.equal(payload.extendedUntil, '2026-11-02');
  assert.equal(Object.hasOwn(payload, 'controlType'), false);
  assert.equal(Object.hasOwn(payload, 'status'), false);
  draft.controlSchedule.marks[0].text = 'Черновик';
  draft.controlSchedule.customDates.push('2026-10-27');
  assert.deepEqual(payload.controlSchedule, {
    frequency: 'custom', firstDate: '', customDates: ['2026-10-26'], marks: [{ date: '2026-10-26', text: 'Проверено' }],
  });
  assert.equal(Object.hasOwn(payload, 'attachments'), false);
});

test('calendar day, checkpoint moves and factual dates survive independent drafts and plain IPC snapshots', () => {
  const record = { controlSchedule: {
    frequency: 'semiannual', firstDate: '2026-11-01', dayOfMonth: 8, customDates: [],
    moves: [{ from: '2026-11-08', to: '2026-11-10', uiState: 'private' }],
    marks: [{ date: '2026-11-10', text: 'Проверено', actualDate: '2026-11-09', uiState: 'private' }],
  } };
  const draft = reactive(createInstructionDraft(record));
  const expected = {
    frequency: 'semiannual', firstDate: '2026-11-01', dayOfMonth: 8, customDates: [],
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

test('a weekly override survives opening a saved draft and snapshotting it for IPC', () => {
  const controlSchedule = { frequency: 'weekly', firstDate: '2026-11-01', dayOfWeek: 2, customDates: [], marks: [] };
  const draft = reactive(createInstructionDraft({ controlSchedule }));
  assert.deepEqual(structuredClone(snapshotInstruction(draft)).controlSchedule, controlSchedule);
});

test('an annual month and day survive opening a saved draft and snapshotting it for IPC', () => {
  const controlSchedule = { frequency: 'yearly', firstDate: '2026-11-01', dayOfMonth: 29, monthOfYear: 2, customDates: [], marks: [] };
  const draft = reactive(createInstructionDraft({ controlSchedule }));
  assert.deepEqual(structuredClone(snapshotInstruction(draft)).controlSchedule, controlSchedule);
});
