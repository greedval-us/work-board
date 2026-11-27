import { daysInMonth, validateDate, validateId, validateTask, ValidationError } from '../../shared/registry.js';
import { ISO_MONTH_PATTERN } from '../../shared/constants/dates.js';
import { firstTaskOccurrence } from '../../shared/taskRecurrence.js';
import { validateDateRange } from '../../shared/validation.js';
import { occurrenceCompletion, occurrenceView, originalDateForMove, planOccurrenceUpdate, validateOccurrenceCompletion } from '../domain/taskOccurrences.js';
import { AppError } from '../errors/AppError.js';
import { agendaTasks, findTask, listOccurrenceMoves, listStoredTasks, movesAt, movesForTask, occurrencesInRange, overdueTasks } from './tasks/queries.js';

const TASK_NOT_FOUND = 'Задача не найдена.';

function taskValues({ title, date, description, priority, completed, recurrence }) {
  return [title, date, description, priority, Number(!recurrence && completed), recurrence ? JSON.stringify(recurrence) : ''];
}

export class TaskRepository {
  constructor(database) { this.database = database; }

  list(request = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ValidationError('Некорректный запрос задач.');
    const { from, to, agendaDate, month } = request;
    if (agendaDate === undefined && month === undefined) return listStoredTasks(this.database, { from, to });
    if ((agendaDate !== undefined && month !== undefined) || from !== undefined || to !== undefined) {
      throw new ValidationError('Выберите один режим просмотра задач.');
    }
    if (agendaDate !== undefined) return agendaTasks(this.database, validateDate(agendaDate, 'Дата списка задач'));
    if (typeof month !== 'string' || !ISO_MONTH_PATTERN.test(month)) throw new ValidationError('Выберите корректный месяц.');
    const [year, number] = month.split('-').map(Number);
    return this.occurrences({ from: `${month}-01`, to: `${month}-${daysInMonth(year, number)}` });
  }

  overdueBefore(day) {
    validateDate(day);
    return overdueTasks(this.database.connection, day);
  }

  occurrences({ from, to }) {
    validateDate(from, 'Дата с');
    validateDate(to, 'Дата по');
    validateDateRange(from, to);
    return occurrencesInRange(this.database.connection, { from, to });
  }

  get(id, date) {
    validateId(id);
    if (date !== undefined) validateDate(date, 'Дата задачи');
    return findTask(this.database.connection, id, date);
  }

  occurrenceMoves() {
    return listOccurrenceMoves(this.database.connection);
  }

  #requireTask(id) {
    const task = this.get(id);
    if (!task) throw new AppError(TASK_NOT_FOUND, 'NOT_FOUND');
    return task;
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
    const existing = this.#requireTask(id);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new ValidationError('Некорректные изменения задачи.');
    const data = validateTask({ ...existing, ...changes });
    const connection = this.database.connection;
    const moves = existing.recurrence ? movesForTask(connection, id) : [];
    const { removedMoves, completion } = planOccurrenceUpdate(existing, data, moves, occurrence);
    connection.prepare(`UPDATE calendar_tasks SET title = ?, date = ?, description = ?,
      priority = ?, completed = ?, recurrence = ?, updated_at = ? WHERE id = ?`)
      .run(...taskValues(data), new Date().toISOString(), id);
    for (const { originalDate } of removedMoves) this.#removeMove(id, originalDate);
    if (completion) this.#writeCompletion(id, completion);
    return this.get(id, occurrence?.date);
  }

  updateOccurrence(id, date, completed) {
    const existing = this.#requireTask(id);
    const requested = validateOccurrenceCompletion({ date, completed });
    const completion = occurrenceCompletion(existing, movesAt(this.database.connection, id, date), requested);
    this.#writeCompletion(id, completion);
    return occurrenceView(existing, date, completed, completion.date);
  }

  moveOccurrence(id, from, to) {
    validateDate(from, 'Текущая дата повторения');
    validateDate(to, 'Новая дата повторения');
    const task = this.#requireTask(id);
    const originalDate = originalDateForMove(task, movesAt(this.database.connection, id, from, to), from, to);
    if (from === to) return this.get(id, to);
    if (to === originalDate) {
      this.#removeMove(id, originalDate);
    } else {
      this.database.connection.prepare(`INSERT INTO calendar_task_moves (task_id, original_date, target_date) VALUES (?, ?, ?)
        ON CONFLICT (task_id, original_date) DO UPDATE SET target_date = excluded.target_date`).run(id, originalDate, to);
    }
    return this.get(id, to);
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
    if (!result.changes) throw new AppError(TASK_NOT_FOUND, 'NOT_FOUND');
    return { removed: true };
  }
}
