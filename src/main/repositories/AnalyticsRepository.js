import { instructionDeadlineRange } from '../database/instructionDeadline.js';

export class AnalyticsRepository {
  constructor(database, { planning = false } = {}) {
    this.database = database;
    this.table = planning ? 'plans' : 'instructions';
    this.itemColumns = planning ? 'plan_item AS planItem,' : '';
  }

  records(filters) {
    const bounds = instructionDeadlineRange(filters.from, filters.to).filter(([value]) => value);
    const values = bounds.map(([value]) => value);
    const clauses = [];
    if (bounds.length) clauses.push(`((${bounds.map(([, clause]) => clause).join(' AND ')}) OR control_schedule <> '')`);
    if (filters.executor) {
      clauses.push('executor_search = ?');
      values.push(filters.executor);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database.connection.prepare(`SELECT id, instruction_number AS instructionNumber, title, deadline, ${this.itemColumns}
      extended_until AS extendedUntil, closed_at AS closedAt, control_schedule AS controlSchedule,
      executor AS executorLabel, executor_search AS executorKey FROM ${this.table} ${where} ORDER BY id`).iterate(...values);
  }

  executorOptions() {
    return this.database.connection.prepare(`SELECT executor_search AS key, executor AS label
      FROM ${this.table} WHERE id IN (SELECT MIN(id) FROM ${this.table} GROUP BY executor_search)
      ORDER BY id`).all().map(row => ({ ...row }));
  }
}
