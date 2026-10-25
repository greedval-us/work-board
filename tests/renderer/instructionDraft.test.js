import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { createInstructionDraft, snapshotInstruction } from '../../src/renderer/domain/instructions.js';

test('instruction drafts contain only editable fields and start with independent attachment changes', () => {
  const record = { id: 7, title: 'Указание', status: 'pending', createdAt: 'private', attachments: { add: [{ token: 'stale' }], remove: [8] } };
  const first = createInstructionDraft(record);
  const second = createInstructionDraft(record);
  assert.deepEqual(first, {
    controlDate: '', incomingNumber: '', instructionNumber: '', title: 'Указание', summary: '', deadline: '', executor: '',
    status: 'pending', executionMark: '', attachments: { add: [], remove: [] },
  });
  first.attachments.add.push({ token: 'new' });
  assert.deepEqual(second.attachments, { add: [], remove: [] });
});

test('instruction snapshots strip renderer metadata and can cross the structured-clone boundary', () => {
  const draft = reactive({
    id: 7, controlDate: '2026-10-26', incomingNumber: '1', instructionNumber: '2', title: 'Указание', summary: '',
    deadline: '2026-10-27', executor: 'Иванов', status: 'pending', executionMark: '',
    attachments: { add: [{ token: 'selection', name: 'file.txt', size: 1 }], remove: [8] },
  });
  const result = snapshotInstruction(draft);
  const payload = structuredClone(result);
  assert.equal(Object.hasOwn(payload, 'id'), false);
  assert.deepEqual(payload.attachments, { add: [{ token: 'selection' }], remove: [8] });
  draft.attachments.remove.push(9);
  assert.deepEqual(payload.attachments.remove, [8]);
  assert.equal(Object.hasOwn(snapshotInstruction({ title: 'Draft' }), 'attachments'), false);
});
