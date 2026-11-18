import { EFFECTIVE_INSTRUCTION_DEADLINE_SQL } from '../database/instructionDeadline.js';

function queryParts(filters) {
  const clauses = [];
  const values = [];
  for (const [value, clause] of [
    [filters.from, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} >= ?`],
    [filters.to, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} <= ?`],
    [filters.executor, 'executor_search = ?'],
  ]) {
    if (!value) continue;
    clauses.push(clause);
    values.push(value);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

export class AnalyticsRepository {
  constructor(database) { this.database = database; }

  groups(filters, today) {
    const { where, values } = queryParts(filters);
    return this.database.connection.prepare(`SELECT executor AS executorLabel, executor_search AS executorKey,
      substr(${EFFECTIVE_INSTRUCTION_DEADLINE_SQL}, 1, 7) AS month, COUNT(*) AS total,
      SUM(closed_at IS NOT NULL) AS closed,
      SUM(CASE WHEN closed_at IS NULL AND ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} < ? THEN 1 ELSE 0 END) AS overdue
      FROM instructions ${where}
      GROUP BY month, executor_search, executor ORDER BY MIN(id)`).all(today, ...values);
  }

  executorOptions() {
    return this.database.connection.prepare(`SELECT executor_search AS key, executor AS label
      FROM instructions WHERE id IN (SELECT MIN(id) FROM instructions GROUP BY executor_search)
      ORDER BY id`).all().map(row => ({ ...row }));
  }

  instructions(filters, { limit, offset }) {
    const { where, values } = queryParts(filters);
    return this.database.connection.prepare(`SELECT id, instruction_number AS instructionNumber, title, deadline,
      extended_until AS extendedUntil, closed_at AS closedAt FROM instructions ${where}
      ORDER BY ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL}, id LIMIT ? OFFSET ?`)
      .all(...values, limit, offset).map(row => ({ ...row }));
  }
}
