import { controlColumns } from './constants/control.js';
import { validateControlFields } from './controlRecord.js';
import { normalizeControlListRequest, normalizeControlExportRequest } from './controlRequests.js';
import { validateRecord, validateText } from './validation.js';

export const PLAN_ITEM_COLUMN = Object.freeze({ key: 'planItem', label: 'Пункт плана' });
export const PLAN_COLUMNS = controlColumns('Название плана', [PLAN_ITEM_COLUMN]);

export function validatePlan(value) {
  const data = validateRecord(value, 'План');
  const fields = validateControlFields(data, 'Название плана');
  return {
    ...fields,
    instructionNumber: fields.instructionNumber.trim(),
    planItem: validateText(data.planItem, 'Пункт плана'),
  };
}

export function normalizePlanListRequest(value = {}) {
  return normalizeControlListRequest(value, PLAN_COLUMNS);
}

export function normalizePlanExportRequest(value = {}) {
  return normalizeControlExportRequest(value, PLAN_COLUMNS);
}
