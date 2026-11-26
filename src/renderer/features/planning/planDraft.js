import { createRecordDraft, snapshotRecord } from '../control/recordDraft.js';

const documentFields = ['title', 'incomingNumber', 'instructionNumber', 'documentType', 'source', 'summary', 'executionMark'];

export function createPlanDraft(record) {
  return { ...createRecordDraft(record), planItem: record.planItem ?? '' };
}

export function copyPlanDocument(previous) {
  return createPlanDraft(Object.fromEntries(documentFields.map(field => [field, previous[field]])));
}

export function snapshotPlan(draft) {
  return { ...snapshotRecord(draft), planItem: draft.planItem };
}
