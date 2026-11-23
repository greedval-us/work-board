import { localDate, normalizeListRequest, normalizeSearch } from '../../../shared/registry.js';
import { CONTROL_FREQUENCIES, getNextControlCheckpoint, listControlCheckpoints } from '../../../shared/controlSchedule.js';
import { EFFECTIVE_INSTRUCTION_DEADLINE_SQL, instructionDeadlineRange } from '../../database/instructionDeadline.js';
import { INSTRUCTION_COLUMNS_SQL } from './row.js';

const NEXT_CHECKPOINT_SQL = `next_instruction_checkpoint(control_schedule, ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL})`;
const CONTROL_FREQUENCY_SQL = `NULLIF(json_extract(NULLIF(control_schedule, ''), '$.frequency'), '')`;
const frequencyCases = Object.keys(CONTROL_FREQUENCIES).filter(Boolean)
  .map((frequency, index) => `WHEN '${frequency}' THEN ${index}`).join(' ');

const SORT_COLUMNS = Object.freeze({
  id: 'id', controlDate: 'control_date', incomingNumber: 'incoming_number', instructionNumber: 'instruction_number_search',
  documentType: 'document_type_search', source: 'source', title: 'title', summary: 'summary', deadline: 'deadline', extendedUntil: 'extended_until',
  nextCheckpoint: 'nextCheckpoint', executor: 'executor_search', controlFrequency: `CASE controlFrequency ${frequencyCases} END`,
  status: 'status', executionMark: 'execution_mark_search',
});

const registeredConnections = new WeakSet();

function registerCheckpointFunctions(connection) {
  if (registeredConnections.has(connection)) return;
  connection.function('next_instruction_checkpoint', { deterministic: true, directOnly: true }, (schedule, deadline) => {
    return schedule ? getNextControlCheckpoint(JSON.parse(schedule), deadline) || null : null;
  });
  connection.function('has_unmarked_instruction_checkpoint', { deterministic: true, directOnly: true }, (schedule, deadline, date) => {
    if (!schedule) return 0;
    const checkpoints = listControlCheckpoints(JSON.parse(schedule), { from: date, to: date, deadline });
    return checkpoints.some(checkpoint => checkpoint.scheduled && !checkpoint.mark) ? 1 : 0;
  });
  registeredConnections.add(connection);
}

function queryParts(request) {
  const { filters, sort, offset, limit, today, closed } = normalizeListRequest(request);
  const scope = closed ? 'closed_at IS NOT NULL' : 'closed_at IS NULL';
  const clauses = [scope];
  const values = [];
  for (const [key, column] of [
    ['instructionNumber', 'instruction_number_search'], ['executor', 'executor_search'], ['executionMark', 'execution_mark_search'],
  ]) {
    if (!filters[key]) continue;
    clauses.push(`instr(${column}, ?) > 0`);
    values.push(normalizeSearch(filters[key]));
  }
  for (const [value, clause] of [
    [normalizeSearch(filters.documentType), 'document_type_search = ?'],
    ...instructionDeadlineRange(filters.deadlineFrom, filters.deadlineTo),
    [filters.status, 'status = ?'],
  ]) {
    if (!value) continue;
    clauses.push(clause);
    values.push(value);
  }
  const checkpointDate = !closed && filters.checkpoint === 'today' ? today ?? localDate() : '';
  if (closed && filters.checkpoint) {
    clauses.push('0');
  } else if (checkpointDate) {
    clauses.push(`has_unmarked_instruction_checkpoint(control_schedule, ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL}, ?) = 1`);
    values.push(checkpointDate);
  } else if (filters.checkpoint === 'overdue') {
    clauses.push(`${NEXT_CHECKPOINT_SQL} < ?`);
    values.push(today ?? localDate());
  }
  const direction = sort.direction.toUpperCase();
  const nulls = sort.field === 'nextCheckpoint' || sort.field === 'controlFrequency' ? ' NULLS LAST' : '';
  const order = `ORDER BY ${SORT_COLUMNS[sort.field]} ${direction}${nulls}`;
  const nextCheckpoint = closed ? 'NULL' : checkpointDate ? '?' : NEXT_CHECKPOINT_SQL;
  return {
    scope, where: `WHERE ${clauses.join(' AND ')}`, values, offset, limit,
    columns: `${INSTRUCTION_COLUMNS_SQL}, ${nextCheckpoint} AS nextCheckpoint, ${CONTROL_FREQUENCY_SQL} AS controlFrequency`,
    selectValues: checkpointDate ? [checkpointDate, ...values] : values,
    order: sort.field === 'id' ? order : `${order}, id ${direction}`,
  };
}

export function instructionRegistryQuery(database, request) {
  const query = queryParts(request);
  const connection = database.connection;
  registerCheckpointFunctions(connection);
  const from = `FROM instructions ${query.where}`;
  const select = `SELECT ${query.columns} ${from} ${query.order}`;

  function items(pagination = '', pageValues = []) {
    return connection.prepare(select + pagination).all(...query.selectValues, ...pageValues).map(row => ({
      ...row, nextCheckpoint: row.nextCheckpoint ?? '', controlFrequency: row.controlFrequency ?? '',
    }));
  }

  return {
    all() { return items(); },
    page() {
      const total = connection.prepare(`SELECT COUNT(*) AS total ${from}`).get(...query.values).total;
      const rows = items(' LIMIT ? OFFSET ?', [query.limit, query.offset]);
      const documentTypes = connection.prepare(`SELECT MIN(document_type) AS label FROM instructions
        WHERE ${query.scope} AND document_type_search <> ''
        GROUP BY document_type_search ORDER BY document_type_search`).all().map(({ label }) => label);
      return { items: rows, total, documentTypes };
    },
  };
}
