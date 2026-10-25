import { validateDate, validateId, validateTask, ValidationError } from '../../shared/registry.js';
import { AppError } from '../utils/AppError.js';
import { validateDateRange } from '../../shared/validation.js';

const COLUMNS = 'id, title, date, description, priority, completed, created_at AS createdAt, updated_at AS updatedAt';
const fromRow = row => row ? { ...row, completed: Boolean(row.completed) } : null;

export class TaskRepository {
  constructor(database) { this.database = database; }

  list(request = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ValidationError('Некорректный запрос задач.');
    const { from, to } = request;
    const clauses = [];
    const values = [];
    if (from !== undefined && from !== '') { clauses.push('date >= ?'); values.push(validateDate(from, 'Дата с')); }
    if (to !== undefined && to !== '') { clauses.push('date <= ?'); values.push(validateDate(to, 'Дата по')); }
    validateDateRange(from, to);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database.connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks ${where} ORDER BY date ASC, id ASC`)
      .all(...values).map(fromRow);
  }

  get(id) {
    validateId(id);
    return fromRow(this.database.connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks WHERE id = ?`).get(id));
  }

  create(value) {
    const data = validateTask(value);
    const now = new Date().toISOString();
    const result = this.database.connection.prepare(`INSERT INTO calendar_tasks
      (title, date, description, priority, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(data.title, data.date, data.description, data.priority, Number(data.completed), now, now);
    return this.get(Number(result.lastInsertRowid));
  }

  update(id, changes) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения задачи.');
    const data = validateTask({ ...existing, ...changes });
    this.database.connection.prepare(`UPDATE calendar_tasks SET title = ?, date = ?, description = ?,
      priority = ?, completed = ?, updated_at = ? WHERE id = ?`)
      .run(data.title, data.date, data.description, data.priority, Number(data.completed), new Date().toISOString(), id);
    return this.get(id);
  }

  remove(id) {
    validateId(id);
    const result = this.database.connection.prepare('DELETE FROM calendar_tasks WHERE id = ?').run(id);
    if (!result.changes) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    return { removed: true };
  }
}
