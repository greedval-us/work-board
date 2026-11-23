import { INSTRUCTION_FIELDS } from '../../../shared/registry.js';
import { emptyControlSchedule } from '../../../shared/controlSchedule.js';

function snapshotControlSchedule({ frequency, firstDate, customDates, marks, moves, dayOfMonth, dayOfWeek, monthOfYear, periodDates }) {
  return {
    frequency, firstDate, customDates: [...customDates],
    marks: marks.map(({ date, text, actualDate }) => ({ date, text, ...(actualDate === undefined ? {} : { actualDate }) })),
    ...(moves === undefined ? {} : { moves: moves.map(({ from, to }) => ({ from, to })) }),
    ...(dayOfMonth === undefined ? {} : { dayOfMonth }),
    ...(dayOfWeek === undefined ? {} : { dayOfWeek }),
    ...(monthOfYear === undefined ? {} : { monthOfYear }),
    ...(periodDates === undefined ? {} : { periodDates: { ...periodDates } }),
  };
}

export function createInstructionDraft(record) {
  return {
    ...Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, record[field] ?? ''])),
    controlSchedule: snapshotControlSchedule(record.controlSchedule ?? emptyControlSchedule()),
  };
}

export function snapshotInstruction(values) {
  const data = Object.fromEntries(INSTRUCTION_FIELDS.map(field => [field, values[field]]));
  if (values.controlSchedule !== undefined) data.controlSchedule = snapshotControlSchedule(values.controlSchedule);
  return data;
}
