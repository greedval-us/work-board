import { daysInMonth, validateDate, validateId, validateTask, ValidationError } from '../../shared/registry.js';
import { ISO_MONTH_PATTERN } from '../../shared/constants/dates.js';
import { firstTaskOccurrence } from '../../shared/taskRecurrence.js';
import { validateDateRange } from '../../shared/validation.js';
import {
  listTaskOccurrences, occurrenceCompletion, occurrenceView, originalDateForMove, originalOccurrenceDate, planOccurrenceUpdate, taskAgendaOccurrences,
  validateOccurrenceCompletion,
} from '../domain/taskOccurrences.js';
import { AppError } from '../errors/AppError.js';

const COLUMNS = 'id, title, date, description, priority, completed, recurrence, created_at AS createdAt, updated_at AS updatedAt';
const MOVE_COLUMNS = 'task_id AS taskId, original_date AS originalDate, target_date AS date';

function fromRow(row) {
  if (!row) return null;
  const { recurrence, ...task } = row;
  return { ...task, completed: Boolean(task.completed), ...(recurrence ? { recurrence: JSON.parse(recurrence) } : {}) };
}

function taskValues({ title, date, description, priority, completed, recurrence }) {
  return [title, date, description, priority, Number(!recurrence && completed), recurrence ? JSON.stringify(recurrence) : ''];
}

export class TaskRepository {
  constructor(database) { this.database = database; }

  list(request = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ValidationError('Некорректный запрос задач.');
    const { from, to, agendaDate, month } = request;
    if (agendaDate !== undefined || month !== undefined) {
      if ((agendaDate !== undefined && month !== undefined) || from !== undefined || to !== undefined) {
        throw new ValidationError('Выберите один режим просмотра задач.');
      }
      if (month !== undefined) {
        if (typeof month !== 'string' || !ISO_MONTH_PATTERN.test(month)) throw new ValidationError('Выберите корректный месяц.');
        const [year, number] = month.split('-').map(Number);
        return this.occurrences({ from: `${month}-01`, to: `${month}-${daysInMonth(year, number)}` });
      }
      return this.#agenda(validateDate(agendaDate, 'Дата списка задач'));
    }
    const clauses = [];
    const values = [];
    if (from !== undefined && from !== '') { clauses.push('date >= ?'); values.push(validateDate(from, 'Дата с')); }
    if (to !== undefined && to !== '') { clauses.push('date <= ?'); values.push(validateDate(to, 'Дата по')); }
    validateDateRange(from, to);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database.connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks ${where} ORDER BY date ASC, id ASC`)
      .all(...values).map(fromRow);
  }

  #agenda(agendaDate) {
    const tasks = this.list();
    if (!tasks.some(task => task.recurrence)) return tasks;
    const occurrences = taskAgendaOccurrences(tasks, this.occurrenceMoves(), agendaDate);
    const candidates = occurrences.map(({ task, originalDate }) => [task.id, originalDate]);
    const completed = this.database.connection.prepare(`SELECT c.task_id AS taskId
      FROM json_each(?) AS candidate
      JOIN calendar_task_completions AS c ON c.task_id = json_extract(candidate.value, '$[0]')
        AND c.date = json_extract(candidate.value, '$[1]')`).all(JSON.stringify(candidates));
    const completedIds = new Set(completed.map(({ taskId }) => taskId));
    return [
      ...tasks.filter(task => !task.recurrence),
      ...occurrences.map(({ task, date, originalDate }) => occurrenceView(task, date, completedIds.has(task.id), originalDate)),
    ].sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id);
  }

  occurrences({ from, to }) {
    validateDate(from, 'Дата с');
    validateDate(to, 'Дата по');
    validateDateRange(from, to);
    const connection = this.database.connection;
    const tasks = connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks
      WHERE (date <= ? AND (date >= ? OR recurrence <> ''))
        OR id IN (SELECT task_id FROM calendar_task_moves WHERE target_date BETWEEN ? AND ?)`)
      .all(to, from, from, to).map(fromRow);
    const moves = connection.prepare(`SELECT ${MOVE_COLUMNS} FROM calendar_task_moves
      WHERE original_date BETWEEN ? AND ? OR target_date BETWEEN ? AND ?`).all(from, to, from, to);
    const completions = connection.prepare(`SELECT task_id AS taskId, date FROM calendar_task_completions
      WHERE date BETWEEN ? AND ?
      UNION ALL
      SELECT c.task_id AS taskId, c.date FROM calendar_task_moves AS m
      JOIN calendar_task_completions AS c ON c.task_id = m.task_id AND c.date = m.original_date
      WHERE m.target_date BETWEEN ? AND ?`).all(from, to, from, to);
    return listTaskOccurrences(tasks, moves, completions, { from, to });
  }

  get(id, date) {
    validateId(id);
    if (date !== undefined) validateDate(date, 'Дата задачи');
    const connection = this.database.connection;
    const task = fromRow(connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks WHERE id = ?`).get(id));
    if (!task?.recurrence || date === undefined) return task;
    const originalDate = originalOccurrenceDate(task, date, this.#movesAt(id, date));
    if (!originalDate) return null;
    const completed = connection.prepare('SELECT 1 FROM calendar_task_completions WHERE task_id = ? AND date = ?').get(id, originalDate);
    return occurrenceView(task, date, Boolean(completed), originalDate);
  }

  occurrenceMoves() {
    return this.database.connection.prepare(`SELECT ${MOVE_COLUMNS} FROM calendar_task_moves ORDER BY task_id, original_date`)
      .all().map(row => ({ ...row }));
  }

  create(value) {
    const data = validateTask(value);
    const now = new Date().toISOString();
    const result = this.database.connection.prepare(`INSERT INTO calendar_tasks
      (title, date, description, priority, completed, recurrence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(...taskValues(data), now, now);
    const id = Number(result.lastInsertRowid);
    if (data.recurrence && data.completed) this.#writeCompletion(id, { date: firstTaskOccurrence(data), completed: true });
    return this.get(id);
  }

  update(id, changes, occurrence) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения задачи.');
    const data = validateTask({ ...existing, ...changes });
    const connection = this.database.connection;
    const moves = existing.recurrence ? connection.prepare(`SELECT ${MOVE_COLUMNS} FROM calendar_task_moves WHERE task_id = ?`).all(id) : [];
    const { removedMoves, completion } = planOccurrenceUpdate(existing, data, moves, occurrence);
    connection.prepare(`UPDATE calendar_tasks SET title = ?, date = ?, description = ?,
      priority = ?, completed = ?, recurrence = ?, updated_at = ? WHERE id = ?`)
      .run(...taskValues(data), new Date().toISOString(), id);
    for (const { originalDate } of removedMoves) this.#removeMove(id, originalDate);
    if (completion) this.#writeCompletion(id, completion);
    return this.get(id, occurrence?.date);
  }

  updateOccurrence(id, date, completed) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    const requested = validateOccurrenceCompletion({ date, completed });
    const completion = occurrenceCompletion(existing, this.#movesAt(id, date), requested);
    this.#writeCompletion(id, completion);
    return occurrenceView(existing, date, completed, completion.date);
  }

  moveOccurrence(id, from, to) {
    validateDate(from, 'Текущая дата повторения');
    validateDate(to, 'Новая дата повторения');
    const task = this.get(id);
    if (!task) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    const originalDate = originalDateForMove(task, this.#movesAt(id, from, to), from, to);
    if (from === to) return this.get(id, to);
    if (to === originalDate) {
      this.#removeMove(id, originalDate);
    } else {
      this.database.connection.prepare(`INSERT INTO calendar_task_moves (task_id, original_date, target_date) VALUES (?, ?, ?)
        ON CONFLICT (task_id, original_date) DO UPDATE SET target_date = excluded.target_date`).run(id, originalDate, to);
    }
    return this.get(id, to);
  }

  #movesAt(id, from, to = from) {
    return this.database.connection.prepare(`SELECT ${MOVE_COLUMNS} FROM calendar_task_moves WHERE task_id = ? AND original_date IN (?, ?)
      UNION SELECT ${MOVE_COLUMNS} FROM calendar_task_moves WHERE task_id = ? AND target_date IN (?, ?)`).all(id, from, to, id, from, to);
  }

  #removeMove(id, originalDate) {
    this.database.connection.prepare('DELETE FROM calendar_task_moves WHERE task_id = ? AND original_date = ?').run(id, originalDate);
  }

  #writeCompletion(id, { date, completed }) {
    const connection = this.database.connection;
    if (completed) {
      connection.prepare('INSERT INTO calendar_task_completions (task_id, date) VALUES (?, ?) ON CONFLICT (task_id, date) DO NOTHING')
        .run(id, date);
    } else {
      connection.prepare('DELETE FROM calendar_task_completions WHERE task_id = ? AND date = ?').run(id, date);
    }
  }

  remove(id) {
    validateId(id);
    const result = this.database.connection.prepare('DELETE FROM calendar_tasks WHERE id = ?').run(id);
    if (!result.changes) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    return { removed: true };
  }
}
