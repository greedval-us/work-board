import { createRecordDraft, snapshotRecord } from '../control/recordDraft.js';

const sharedDocumentFields = ['title', 'incomingNumber', 'instructionNumber', 'documentType', 'source', 'summary'];

export function createPlanDraft(record = {}) {
  return { ...createRecordDraft(record), planItem: record.planItem ?? '', activity: record.activity ?? '' };
}

export function snapshotPlan(draft, firstRow = draft) {
  const data = snapshotRecord(draft);
  for (const field of sharedDocumentFields) data[field] = firstRow[field];
  return { ...data, planItem: draft.planItem, activity: draft.activity };
}
