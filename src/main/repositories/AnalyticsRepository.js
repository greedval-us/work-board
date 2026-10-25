import { normalizeSearch } from '../../shared/registry.js';

export class AnalyticsRepository {
  constructor(database) { this.database = database; }
  groups(filters, today) {
    const clauses = []; const values = [today];
    for (const [value, clause] of [[filters.from, 'date >= ?'], [filters.to, 'date <= ?'], [filters.entityType, 'kind = ?']]) {
      if (value) { clauses.push(clause); values.push(value); }
    }
    if (filters.status) {
      if (filters.status === 'active') clauses.push("status <> 'completed'");
      else { clauses.push('status = ?'); values.push(filters.status); }
    }
    if (filters.priority) { clauses.push("kind = 'tasks' AND priority = ?"); values.push(filters.priority); }
    if (filters.executor) { clauses.push("kind = 'instructions' AND instr(executor_search, ?) > 0"); values.push(normalizeSearch(filters.executor)); }
    return this.database.connection.prepare(`WITH records AS (
      SELECT 'instructions' AS kind, deadline AS date, status, '' AS priority, executor_search FROM instructions
      UNION ALL
      SELECT 'tasks', date, CASE WHEN completed = 1 THEN 'completed' ELSE 'active' END, priority, '' FROM calendar_tasks
    ) SELECT kind, status, priority, substr(date, 1, 7) AS month, COUNT(*) AS total,
      SUM(CASE WHEN status <> 'completed' AND date < ? THEN 1 ELSE 0 END) AS overdue
      FROM records ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      GROUP BY kind, status, priority, month ORDER BY month`).all(...values);
  }
}
