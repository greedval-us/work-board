import { controlColumns } from './constants/control.js';
import { validateControlFields } from './controlRecord.js';
import { normalizeControlListRequest, normalizeControlExportRequest } from './controlRequests.js';
import { validateRecord, validateText } from './validation.js';
import { ValidationError } from './errors.js';

export const PLAN_ACTIVITY_LIMIT = 20_000;
export const PLAN_ITEM_COLUMN = Object.freeze({ key: 'planItem', label: 'Пункт плана' });
export const PLAN_ACTIVITY_COLUMN = Object.freeze({ key: 'activity', label: 'Мероприятие' });
export const PLAN_COLUMNS = controlColumns('Название плана', [PLAN_ITEM_COLUMN, PLAN_ACTIVITY_COLUMN]);

export function validatePlan(value) {
  const data = validateRecord(value, 'План');
  const fields = validateControlFields(data, 'Название плана');
  const activity = validateText(data.activity, 'Мероприятие');
  if (activity.length > PLAN_ACTIVITY_LIMIT) throw new ValidationError(`Мероприятие: допустимо до ${PLAN_ACTIVITY_LIMIT} символов.`);
  return {
    ...fields,
    instructionNumber: fields.instructionNumber.trim(),
    planItem: validateText(data.planItem, 'Пункт плана'),
    activity,
  };
}

export function normalizePlanListRequest(value = {}) {
  return normalizeControlListRequest(value, PLAN_COLUMNS);
}

export function normalizePlanExportRequest(value = {}) {
  return normalizeControlExportRequest(value, PLAN_COLUMNS);
}
