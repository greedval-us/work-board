import {
  normalizeListRequest, normalizeSearch, validateId, validateInstruction, ValidationError,
} from '../../shared/registry.js';
import { AppError } from '../utils/AppError.js';

const COLUMNS = `id, control_date AS controlDate, incoming_number AS incomingNumber,
  instruction_number AS instructionNumber, title, summary, deadline, executor, status,
  execution_mark AS executionMark, created_at AS createdAt, updated_at AS updatedAt`;

const SORT_COLUMNS = Object.freeze({
  controlDate: 'control_date', incomingNumber: 'incoming_number', instructionNumber: 'instruction_number_search',
  title: 'title', summary: 'summary', deadline: 'deadline', executor: 'executor_search',
  status: 'status', executionMark: 'execution_mark_search',
});

function queryParts(request) {
  const { filters, sort, offset, limit } = normalizeListRequest(request);
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
    [filters.deadlineFrom, 'deadline >= ?'], [filters.deadlineTo, 'deadline <= ?'], [filters.status, 'status = ?'],
  ]) {
    if (!value) continue;
    clauses.push(clause);
    values.push(value);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values, offset, limit,
    order: `ORDER BY ${SORT_COLUMNS[sort.field]} ${sort.direction.toUpperCase()}, id ${sort.direction.toUpperCase()}`,
  };
}

function parameters(data) {
  return [
    data.controlDate, data.incomingNumber, data.instructionNumber, data.title, data.summary,
    data.deadline, data.executor, data.status, data.executionMark,
    normalizeSearch(data.instructionNumber), normalizeSearch(data.executor), normalizeSearch(data.executionMark),
  ];
}

export class InstructionRepository {
  constructor(database) { this.database = database; }

  list(request) {
    const query = queryParts(request);
    const connection = this.database.connection;
    const total = connection.prepare(`SELECT COUNT(*) AS total FROM instructions ${query.where}`).get(...query.values).total;
    const items = connection.prepare(`SELECT ${COLUMNS} FROM instructions ${query.where} ${query.order} LIMIT ? OFFSET ?`)
      .all(...query.values, query.limit, query.offset).map(row => ({ ...row }));
    return { items, total };
  }

  all(request) {
    const query = queryParts(request);
    return this.database.connection.prepare(`SELECT ${COLUMNS} FROM instructions ${query.where} ${query.order}`)
      .all(...query.values).map(row => ({ ...row }));
  }

  get(id) {
    validateId(id);
    const row = this.database.connection.prepare(`SELECT ${COLUMNS} FROM instructions WHERE id = ?`).get(id);
    return row ? { ...row } : null;
  }

  create(value) {
    const data = validateInstruction(value);
    const now = new Date().toISOString();
    const result = this.database.connection.prepare(`INSERT INTO instructions (
      control_date, incoming_number, instruction_number, title, summary, deadline, executor, status, execution_mark,
      instruction_number_search, executor_search, execution_mark_search, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(...parameters(data), now, now);
    return this.get(Number(result.lastInsertRowid));
  }

  update(id, changes) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения указания.');
    const data = validateInstruction({ ...existing, ...changes });
    this.database.connection.prepare(`UPDATE instructions SET
      control_date = ?, incoming_number = ?, instruction_number = ?, title = ?, summary = ?, deadline = ?,
      executor = ?, status = ?, execution_mark = ?, instruction_number_search = ?, executor_search = ?,
      execution_mark_search = ?, updated_at = ? WHERE id = ?`)
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
