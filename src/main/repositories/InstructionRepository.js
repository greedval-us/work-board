import {
  localDate, normalizeListRequest, normalizeSearch, validateId, validateInstruction, ValidationError,
} from '../../shared/registry.js';
import { CONTROL_FREQUENCIES, emptyControlSchedule, getNextControlCheckpoint, listControlCheckpoints } from '../../shared/controlSchedule.js';
import { EFFECTIVE_INSTRUCTION_DEADLINE_SQL } from '../database/instructionDeadline.js';
import { AppError } from '../utils/AppError.js';

const COLUMNS = `id, control_date AS controlDate, incoming_number AS incomingNumber,
  instruction_number AS instructionNumber, source, title, summary, deadline, extended_until AS extendedUntil,
  executor, status,
  execution_mark AS executionMark, created_at AS createdAt, updated_at AS updatedAt`;
const NEXT_CHECKPOINT_SQL = `next_instruction_checkpoint(control_schedule, ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL})`;
const CONTROL_FREQUENCY_SQL = `NULLIF(json_extract(NULLIF(control_schedule, ''), '$.frequency'), '')`;
const frequencyCases = Object.keys(CONTROL_FREQUENCIES).filter(Boolean)
  .map((frequency, index) => `WHEN '${frequency}' THEN ${index}`).join(' ');

const SORT_COLUMNS = Object.freeze({
  id: 'id', controlDate: 'control_date', incomingNumber: 'incoming_number', instructionNumber: 'instruction_number_search',
  source: 'source', title: 'title', summary: 'summary', deadline: 'deadline', extendedUntil: 'extended_until',
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
  const { filters, sort, offset, limit, today } = normalizeListRequest(request);
  const clauses = [];
  const values = [];
  for (const [key, column] of [
    ['instructionNumber', 'instruction_number_search'], ['executor', 'executor_search'], ['executionMark', 'execution_mark_search'],
  ]) {
    if (!filters[key]) continue;
    clauses.push(`instr(${column}, ?) > 0`);
    values.push(normalizeSearch(filters[key]));
  }
  for (const [value, clause] of [
    [filters.deadlineFrom, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} >= ?`],
    [filters.deadlineTo, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} <= ?`],
    [filters.status, 'status = ?'],
  ]) {
    if (!value) continue;
    clauses.push(clause);
    values.push(value);
  }
  const checkpointDate = filters.checkpoint === 'today' ? today ?? localDate() : '';
  if (checkpointDate) {
    clauses.push(`has_unmarked_instruction_checkpoint(control_schedule, ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL}, ?) = 1`);
    values.push(checkpointDate);
  } else if (filters.checkpoint === 'overdue') {
    clauses.push(`${NEXT_CHECKPOINT_SQL} < ?`);
    values.push(today ?? localDate());
  }
  const direction = sort.direction.toUpperCase();
  const nulls = sort.field === 'nextCheckpoint' || sort.field === 'controlFrequency' ? ' NULLS LAST' : '';
  const order = `ORDER BY ${SORT_COLUMNS[sort.field]} ${direction}${nulls}`;
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values, offset, limit,
    columns: `${COLUMNS}, ${checkpointDate ? '?' : NEXT_CHECKPOINT_SQL} AS nextCheckpoint, ${CONTROL_FREQUENCY_SQL} AS controlFrequency`,
    selectValues: checkpointDate ? [checkpointDate, ...values] : values,
    order: sort.field === 'id' ? order : `${order}, id ${direction}`,
  };
}

function parameters(data) {
  const schedule = data.controlSchedule;
  return [
    data.controlDate, data.incomingNumber, data.instructionNumber, data.source, data.title, data.summary,
    data.deadline, data.extendedUntil, data.executor, data.status, data.executionMark,
    normalizeSearch(data.instructionNumber), normalizeSearch(data.executor), normalizeSearch(data.executionMark),
    schedule.frequency || schedule.marks.length ? JSON.stringify(schedule) : '',
  ];
}

function withControlSchedule({ controlSchedule, ...row }) {
  return { ...row, controlSchedule: controlSchedule ? JSON.parse(controlSchedule) : emptyControlSchedule() };
}

function registryRow(row) {
  return { ...row, nextCheckpoint: row.nextCheckpoint ?? '', controlFrequency: row.controlFrequency ?? '' };
}

export class InstructionRepository {
  constructor(database) { this.database = database; }

  list(request) {
    const query = queryParts(request);
    const connection = this.database.connection;
    registerCheckpointFunctions(connection);
    const total = connection.prepare(`SELECT COUNT(*) AS total FROM instructions ${query.where}`).get(...query.values).total;
    const items = connection.prepare(`SELECT ${query.columns} FROM instructions ${query.where} ${query.order} LIMIT ? OFFSET ?`)
      .all(...query.selectValues, query.limit, query.offset).map(registryRow);
    return { items, total };
  }

  all(request) {
    const query = queryParts(request);
    const connection = this.database.connection;
    registerCheckpointFunctions(connection);
    return connection.prepare(`SELECT ${query.columns} FROM instructions ${query.where} ${query.order}`)
      .all(...query.selectValues).map(registryRow);
  }

  get(id) {
    validateId(id);
    const row = this.database.connection.prepare(`SELECT ${COLUMNS}, control_schedule AS controlSchedule FROM instructions WHERE id = ?`).get(id);
    return row ? withControlSchedule(row) : null;
  }

  scheduledForCalendar() {
    return this.database.connection.prepare(`SELECT id, title, instruction_number AS instructionNumber,
      executor, status, deadline, extended_until AS extendedUntil, control_schedule AS controlSchedule, created_at AS createdAt
      FROM instructions WHERE control_schedule <> '' ORDER BY id`)
      .all().map(withControlSchedule);
  }

  create(value) {
    const data = validateInstruction(value);
    const now = new Date().toISOString();
    const result = this.database.connection.prepare(`INSERT INTO instructions (
      control_date, incoming_number, instruction_number, source, title, summary, deadline, extended_until,
      executor, status, execution_mark,
      instruction_number_search, executor_search, execution_mark_search, control_schedule, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(...parameters(data), now, now);
    return this.get(Number(result.lastInsertRowid));
  }

  update(id, changes) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения указания.');
    const data = validateInstruction({ ...existing, ...changes });
    this.database.connection.prepare(`UPDATE instructions SET
      control_date = ?, incoming_number = ?, instruction_number = ?, source = ?, title = ?, summary = ?, deadline = ?, extended_until = ?,
      executor = ?, status = ?, execution_mark = ?, instruction_number_search = ?, executor_search = ?,
      execution_mark_search = ?, control_schedule = ?, updated_at = ? WHERE id = ?`)
      .run(...parameters(data), new Date().toISOString(), id);
    return this.get(id);
  }

  remove(id) {
    validateId(id);
    const result = this.database.connection.prepare('DELETE FROM instructions WHERE id = ?').run(id);
    if (!result.changes) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    return { removed: true };
  }
}
