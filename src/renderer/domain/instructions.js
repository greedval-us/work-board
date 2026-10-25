import { INSTRUCTION_FIELDS } from '../../shared/registry.js';
import { emptyAttachmentChanges, snapshotAttachmentChanges } from './attachments.js';

export function createInstructionDraft(record) {
  return {
    ...Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, record[field] ?? ''])),
    attachments: emptyAttachmentChanges(),
  };
}

export function snapshotInstruction(values) {
  const data = Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, values[field]]));
  if (values.attachments !== undefined) data.attachments = snapshotAttachmentChanges(values.attachments);
  return data;
}
