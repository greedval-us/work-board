import { INSTRUCTION_FIELDS } from '../../shared/registry.js';
import { emptyControlSchedule } from '../../shared/controlSchedule.js';
import { emptyAttachmentChanges, snapshotAttachmentChanges } from './attachments.js';

function snapshotControlSchedule({ frequency, firstDate, customDates, marks }) {
  return { frequency, firstDate, customDates: [...customDates], marks: marks.map(({ date, text }) => ({ date, text })) };
}

export function createInstructionDraft(record) {
  return {
    ...Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, record[field] ?? ''])),
    controlSchedule: snapshotControlSchedule(record.controlSchedule ?? emptyControlSchedule()),
    attachments: emptyAttachmentChanges(),
  };
}

export function snapshotInstruction(values) {
  const data = Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, values[field]]));
  if (values.controlSchedule !== undefined) data.controlSchedule = snapshotControlSchedule(values.controlSchedule);
  if (values.attachments !== undefined) data.attachments = snapshotAttachmentChanges(values.attachments);
  return data;
}
