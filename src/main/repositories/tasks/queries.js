import { validateDate } from '../../../shared/dates.js';
import { validateDateRange } from '../../../shared/validation.js';
import {
  listTaskOccurrences, occurrenceView, originalOccurrenceDate, selectSeriesOccurrences,
} from '../../domain/taskOccurrences.js';

const SELECT_TASKS = `SELECT id, title, date, description, priority, completed, recurrence,
  created_at AS createdAt, updated_at AS updatedAt FROM calendar_tasks`;
const SELECT_MOVES = 'SELECT task_id AS taskId, original_date AS originalDate, target_date AS date FROM calendar_task_moves';

function fromRow(row) {
  if (!row) return null;
  const { recurrence, ...task } = row;
  return { ...task, completed: Boolean(task.completed), ...(recurrence ? { recurrence: JSON.parse(recurrence) } : {}) };
}

export function listStoredTasks(database, { from, to } = {}) {
  const clauses = [];
  const values = [];
  if (from !== undefined && from !== '') { clauses.push('date >= ?'); values.push(validateDate(from, 'Дата с')); }
  if (to !== undefined && to !== '') { clauses.push('date <= ?'); values.push(validateDate(to, 'Дата по')); }
  validateDateRange(from, to);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return database.connection.prepare(`${SELECT_TASKS} ${where} ORDER BY date ASC, id ASC`).all(...values).map(fromRow);
}

export function listOccurrenceMoves(connection) {
  return connection.prepare(`${SELECT_MOVES} ORDER BY task_id, original_date`).all().map(row => ({ ...row }));
}

export function movesForTask(connection, id) {
  return connection.prepare(`${SELECT_MOVES} WHERE task_id = ?`).all(id);
}

export function movesAt(connection, id, from, to = from) {
  return connection.prepare(`${SELECT_MOVES} WHERE task_id = $id AND original_date IN ($from, $to)
    UNION ${SELECT_MOVES} WHERE task_id = $id AND target_date IN ($from, $to)`).all({ id, from, to });
}

export function findTask(connection, id, date) {
  const task = fromRow(connection.prepare(`${SELECT_TASKS} WHERE id = ?`).get(id));
  if (!task?.recurrence || date === undefined) return task;
  const originalDate = originalOccurrenceDate(task, date, movesAt(connection, id, date));
  if (!originalDate) return null;
  const completed = connection.prepare('SELECT 1 FROM calendar_task_completions WHERE task_id = ? AND date = ?').get(id, originalDate);
  return occurrenceView(task, date, Boolean(completed), originalDate);
}

function withSeriesOccurrences(connection, tasks, day, options) {
  if (!tasks.some(task => task.recurrence)) return tasks;
  const occurrences = selectSeriesOccurrences(tasks, listOccurrenceMoves(connection), day, options);
  const candidates = occurrences.map(({ task, originalDate }) => [task.id, originalDate]);
  const completed = connection.prepare(`SELECT c.task_id AS taskId
    FROM json_each(?) AS candidate
    JOIN calendar_task_completions AS c ON c.task_id = json_extract(candidate.value, '$[0]')
      AND c.date = json_extract(candidate.value, '$[1]')`).all(JSON.stringify(candidates));
  const completedIds = new Set(completed.map(({ taskId }) => taskId));
  const records = [
    ...tasks.filter(task => !task.recurrence),
    ...occurrences.map(({ task, date, originalDate }) => occurrenceView(task, date, completedIds.has(task.id), originalDate)),
  ];
  return options.preferUpcoming ? records.sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id) : records;
}

export function agendaTasks(database, day) {
  return withSeriesOccurrences(database.connection, listStoredTasks(database), day, { preferUpcoming: true });
}

export function overdueTasks(connection, day) {
  // A future series can have an occurrence moved to an earlier day.
  const tasks = connection.prepare(`${SELECT_TASKS}
    WHERE (date < $day AND (recurrence <> '' OR completed = 0))
      OR id IN (SELECT task_id FROM calendar_task_moves WHERE target_date < $day)`).all({ day }).map(fromRow);
  return withSeriesOccurrences(connection, tasks, day, { preferUpcoming: false });
}

export function occurrencesInRange(connection, range) {
  const tasks = connection.prepare(`${SELECT_TASKS}
    WHERE (date <= $to AND (date >= $from OR recurrence <> ''))
      OR id IN (SELECT task_id FROM calendar_task_moves WHERE target_date BETWEEN $from AND $to)`).all(range).map(fromRow);
  const moves = connection.prepare(`${SELECT_MOVES}
    WHERE original_date BETWEEN $from AND $to OR target_date BETWEEN $from AND $to`).all(range);
  const completions = connection.prepare(`SELECT task_id AS taskId, date FROM calendar_task_completions
    WHERE date BETWEEN $from AND $to
    UNION ALL
    SELECT c.task_id AS taskId, c.date FROM calendar_task_moves AS m
    JOIN calendar_task_completions AS c ON c.task_id = m.task_id AND c.date = m.original_date
    WHERE m.target_date BETWEEN $from AND $to`).all(range);
  return listTaskOccurrences(tasks, moves, completions, range);
}
