import { validateId, validateInstruction, ValidationError } from '../../shared/registry.js';
import { AppError } from '../errors/AppError.js';
import { instructionRegistryQuery } from './instructions/registryQuery.js';
import { INSTRUCTION_COLUMNS_SQL, instructionRecord, withControlSchedule } from './instructions/row.js';

export class InstructionRepository {
  constructor(database) { this.database = database; }

  list(request) {
    return instructionRegistryQuery(this.database, request).page();
  }

  all(request) {
    return instructionRegistryQuery(this.database, request).all();
  }

  get(id) {
    validateId(id);
    const row = this.database.connection.prepare(`SELECT ${INSTRUCTION_COLUMNS_SQL}, control_schedule AS controlSchedule FROM instructions WHERE id = ?`).get(id);
    return row ? withControlSchedule(row) : null;
  }

  scheduledForCalendar() {
    return this.database.connection.prepare(`SELECT id, title, instruction_number AS instructionNumber,
      executor, status, deadline, extended_until AS extendedUntil, control_schedule AS controlSchedule, created_at AS createdAt
      FROM instructions WHERE control_schedule <> '' AND closed_at IS NULL ORDER BY id`)
      .all().map(withControlSchedule);
  }

  create(value) {
    const data = validateInstruction(value);
    const now = new Date().toISOString();
    const record = { ...instructionRecord(data), created_at: now, updated_at: now };
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const result = this.database.connection.prepare(`INSERT INTO instructions (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(...Object.values(record));
    return this.get(Number(result.lastInsertRowid));
  }

  update(id, changes) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения указания.');
    const data = validateInstruction({ ...existing, ...changes });
    const record = { ...instructionRecord(data), updated_at: new Date().toISOString() };
    const assignments = Object.keys(record).map(column => `${column} = ?`).join(', ');
    this.database.connection.prepare(`UPDATE instructions SET ${assignments} WHERE id = ?`).run(...Object.values(record), id);
    return this.get(id);
  }

  closeControl(id) {
    validateId(id);
    const now = new Date().toISOString();
    this.database.connection.prepare(`UPDATE instructions SET closed_at = ?, updated_at = ?
      WHERE id = ? AND closed_at IS NULL`).run(now, now, id);
    const record = this.get(id);
    if (!record) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    return record;
  }

  remove(id) {
    validateId(id);
    const result = this.database.connection.prepare('DELETE FROM instructions WHERE id = ?').run(id);
    if (!result.changes) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    return { removed: true };
  }
}
