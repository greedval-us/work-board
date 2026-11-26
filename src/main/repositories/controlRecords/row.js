import { emptyControlSchedule } from '../../../shared/controlSchedule.js';
import { normalizeSearch } from '../../../shared/registry.js';

// Shared between document controls with the same card fields.
const fields = {
  control_date: 'controlDate', incoming_number: 'incomingNumber', instruction_number: 'instructionNumber',
  document_type: 'documentType', source: 'source', title: 'title', summary: 'summary', deadline: 'deadline',
  extended_until: 'extendedUntil', executor: 'executor', status: 'status', execution_mark: 'executionMark',
};
const searchColumns = ['instruction_number', 'document_type', 'executor', 'execution_mark'];

export const CONTROL_COLUMNS_SQL = [
  'id', ...Object.entries(fields).map(([column, property]) => `${column} AS ${property}`),
  'created_at AS createdAt', 'updated_at AS updatedAt', 'closed_at AS closedAt',
].join(', ');

export function controlRecord(data) {
  const record = Object.fromEntries(Object.entries(fields).map(([column, property]) => [column, data[property]]));
  for (const column of searchColumns) record[`${column}_search`] = normalizeSearch(record[column]);
  const schedule = data.controlSchedule;
  record.control_schedule = schedule.frequency || schedule.marks.length ? JSON.stringify(schedule) : '';
  return record;
}

export function withControlSchedule({ controlSchedule, ...row }) {
  return { ...row, controlSchedule: controlSchedule ? JSON.parse(controlSchedule) : emptyControlSchedule() };
}
