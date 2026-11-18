import { validateDate, validateId, validateTask, ValidationError } from '../../shared/registry.js';
import { firstTaskOccurrence, isTaskOccurrence, taskOccurrenceDates } from '../../shared/taskRecurrence.js';
import { AppError } from '../utils/AppError.js';
import { validateDateRange, validateRecord } from '../../shared/validation.js';

const COLUMNS = 'id, title, date, description, priority, completed, recurrence, created_at AS createdAt, updated_at AS updatedAt';
const MOVE_COLUMNS = 'task_id AS taskId, original_date AS originalDate, target_date AS date';

function fromRow(row) {
  if (!row) return null;
  const { recurrence, ...task } = row;
  return { ...task, completed: Boolean(task.completed), ...(recurrence ? { recurrence: JSON.parse(recurrence) } : {}) };
}

function occurrenceView(task, date, completed, originalDate = date) {
  return { ...task, date, seriesDate: task.date, completed, ...(date === originalDate ? {} : { originalDate }) };
}

function validateCompletion(value) {
  const { date, completed } = validateRecord(value, 'Отметка повторения задачи');
  validateDate(date, 'Дата повторения задачи');
  if (typeof completed !== 'boolean') throw new ValidationError('Выполнение задачи: укажите да или нет.');
  return { date, completed };
}

function requireOccurrence(originalDate) {
  if (!originalDate) throw new ValidationError('На эту дату повторение задачи не запланировано.');
  return originalDate;
}

function taskValues({ title, date, description, priority, completed, recurrence }) {
  return [title, date, description, priority, Number(!recurrence && completed), recurrence ? JSON.stringify(recurrence) : ''];
}

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

  occurrences({ from, to }) {
    validateDate(from, 'Дата с');
    validateDate(to, 'Дата по');
    validateDateRange(from, to);
    const connection = this.database.connection;
    const tasks = connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks
      WHERE (date <= ? AND (date >= ? OR recurrence <> ''))
        OR id IN (SELECT task_id FROM calendar_task_moves WHERE target_date BETWEEN ? AND ?)`)
      .all(to, from, from, to).map(fromRow);
    const moveRows = connection.prepare(`SELECT ${MOVE_COLUMNS} FROM calendar_task_moves
      WHERE original_date BETWEEN ? AND ? OR target_date BETWEEN ? AND ?`).all(from, to, from, to);
    const moves = new Map();
    for (const move of moveRows) {
      if (!moves.has(move.taskId)) moves.set(move.taskId, []);
      moves.get(move.taskId).push(move);
    }
    const completions = new Set(connection.prepare(`SELECT task_id AS id, date FROM calendar_task_completions
      WHERE date BETWEEN ? AND ?
      UNION ALL
      SELECT c.task_id AS id, c.date FROM calendar_task_moves AS m
      JOIN calendar_task_completions AS c ON c.task_id = m.task_id AND c.date = m.original_date
      WHERE m.target_date BETWEEN ? AND ?`).all(from, to, from, to).map(({ id, date }) => `${id}:${date}`));
    const occurrences = [];
    for (const task of tasks) {
      if (!task.recurrence) {
        occurrences.push(task);
        continue;
      }
      const taskMoves = moves.get(task.id) ?? [];
      const movedOriginals = new Set(taskMoves.map(move => move.originalDate));
      for (const date of taskOccurrenceDates(task, { from, to })) {
        if (!movedOriginals.has(date)) occurrences.push(occurrenceView(task, date, completions.has(`${task.id}:${date}`)));
      }
      for (const { date, originalDate } of taskMoves) {
        if (date >= from && date <= to) {
          occurrences.push(occurrenceView(task, date, completions.has(`${task.id}:${originalDate}`), originalDate));
        }
      }
    }
    return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id);
  }

  get(id, date) {
    validateId(id);
    if (date !== undefined) validateDate(date, 'Дата задачи');
    const connection = this.database.connection;
    const task = fromRow(connection.prepare(`SELECT ${COLUMNS} FROM calendar_tasks WHERE id = ?`).get(id));
    if (!task?.recurrence || date === undefined) return task;
    const originalDate = this.#findOriginalDate(task, date);
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
    const keptMoves = data.recurrence ? moves.filter(move => isTaskOccurrence(data, move.originalDate)) : [];
    const keptOriginals = new Set(keptMoves.map(move => move.originalDate));
    if (keptMoves.some(move => !keptOriginals.has(move.date) && isTaskOccurrence(data, move.date))) {
      throw new ValidationError('Новый график добавляет повторение на дату переноса этой задачи. Сначала выберите другую дату переноса.');
    }
    let completion;
    let occurrenceDate;
    if (occurrence !== undefined) {
      const { date, completed } = validateCompletion(occurrence);
      const keptMove = keptMoves.find(move => move.date === date);
      const hadMove = moves.some(move => move.date === date);
      const isUnmovedDate = data.recurrence && !hadMove && !keptOriginals.has(date) && isTaskOccurrence(data, date);
      const scheduledDate = isUnmovedDate ? date : undefined;
      completion = { date: requireOccurrence(keptMove?.originalDate ?? scheduledDate), completed };
      occurrenceDate = date;
    } else if (data.recurrence && !existing.recurrence && data.completed && isTaskOccurrence(data, existing.date)) {
      completion = { date: existing.date, completed: true };
    }
    connection.prepare(`UPDATE calendar_tasks SET title = ?, date = ?, description = ?,
      priority = ?, completed = ?, recurrence = ?, updated_at = ? WHERE id = ?`)
      .run(...taskValues(data), new Date().toISOString(), id);
    for (const { originalDate } of moves) {
      if (!keptOriginals.has(originalDate)) this.#removeMove(id, originalDate);
    }
    if (completion) this.#writeCompletion(id, completion);
    return this.get(id, occurrenceDate);
  }

  updateOccurrence(id, date, completed) {
    const existing = this.get(id);
    if (!existing) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    validateCompletion({ date, completed });
    const originalDate = requireOccurrence(this.#findOriginalDate(existing, date));
    this.#writeCompletion(id, { date: originalDate, completed });
    return occurrenceView(existing, date, completed, originalDate);
  }

  moveOccurrence(id, from, to) {
    validateDate(from, 'Текущая дата повторения');
    validateDate(to, 'Новая дата повторения');
    const task = this.get(id);
    if (!task) throw new AppError('Задача не найдена.', 'NOT_FOUND');
    if (!task.recurrence) throw new ValidationError('Перенос доступен для повторяющейся задачи.');
    const originalDate = requireOccurrence(this.#findOriginalDate(task, from));
    if (from === to) return this.get(id, to);
    if (this.#findOriginalDate(task, to)) {
      throw new ValidationError('На выбранную дату уже запланировано другое повторение этой задачи.');
    }
    if (to === originalDate) {
      this.#removeMove(id, originalDate);
    } else {
      this.database.connection.prepare(`INSERT INTO calendar_task_moves (task_id, original_date, target_date) VALUES (?, ?, ?)
        ON CONFLICT (task_id, original_date) DO UPDATE SET target_date = excluded.target_date`).run(id, originalDate, to);
    }
    return this.get(id, to);
  }

  #findOriginalDate(task, date) {
    if (!task.recurrence) return undefined;
    const connection = this.database.connection;
    const move = connection.prepare('SELECT original_date AS originalDate FROM calendar_task_moves WHERE task_id = ? AND target_date = ?')
      .get(task.id, date);
    if (move) return move.originalDate;
    const movedAway = connection.prepare('SELECT 1 FROM calendar_task_moves WHERE task_id = ? AND original_date = ?').get(task.id, date);
    if (!movedAway && isTaskOccurrence(task, date)) return date;
    return undefined;
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
