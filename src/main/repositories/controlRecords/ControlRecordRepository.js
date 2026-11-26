import { validateId, validateRecord } from '../../../shared/validation.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { INSTRUCTION_STATUS } from '../../../shared/constants/registry.js';
import { addCalendarDays, validateDate } from '../../../shared/dates.js';
import { iterateControlCheckpoints } from '../../../shared/controlSchedule.js';
import { EFFECTIVE_INSTRUCTION_DEADLINE_SQL } from '../../database/instructionDeadline.js';
import { AppError } from '../../errors/AppError.js';
import { controlListQuery } from './listQuery.js';
import { CONTROL_COLUMNS_SQL, controlRecord, withControlSchedule } from './row.js';

export class ControlRecordRepository {
  // SQL identifiers and mappings are fixed by each repository at construction.
  constructor(database, config) {
    this.database = database;
    const columns = [CONTROL_COLUMNS_SQL, config.extraColumns].filter(Boolean).join(', ');
    this.config = { toRecord: controlRecord, ...config, columns };
  }

  list(request) {
    return controlListQuery(this.database, this.config.normalizeList(request), this.config).page();
  }

  all(request) {
    return controlListQuery(this.database, this.config.normalizeList(request), this.config).all();
  }

  overdueControls(today) {
    validateDate(today);
    if (today === DATE_LIMITS.MIN) return [];
    const through = addCalendarDays(today, -1);
    const { table, extraColumns } = this.config;
    const candidates = this.database.connection.prepare(`SELECT id, instruction_number AS instructionNumber, title, executor,
      ${extraColumns ? extraColumns + ',' : ''} ${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} AS deadline, control_schedule AS controlSchedule
      FROM ${table} WHERE closed_at IS NULL AND status <> ?
      AND (${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} < ? OR control_schedule <> '')`).iterate(INSTRUCTION_STATUS.COMPLETED, today);
    const rows = [];
    for (const { deadline, controlSchedule, ...record } of candidates) {
      if (deadline < today) rows.push({ ...record, dueDate: deadline, controlKind: 'deadline' });
      if (!controlSchedule) continue;
      const schedule = JSON.parse(controlSchedule);
      for (const checkpoint of iterateControlCheckpoints(schedule, { from: DATE_LIMITS.MIN, to: through, deadline })) {
        if (checkpoint.scheduled && !checkpoint.mark) rows.push({ ...record, dueDate: checkpoint.date, controlKind: 'checkpoint' });
      }
    }
    // Stable sort preserves the final deadline first when both controls coincide.
    return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
  }

  scheduledForCalendar() {
    const { table, extraColumns } = this.config;
    const columns = ['id, title, instruction_number AS instructionNumber, executor, status, deadline',
      'extended_until AS extendedUntil, control_schedule AS controlSchedule, created_at AS createdAt', extraColumns]
      .filter(Boolean).join(', ');
    return this.database.connection.prepare(`SELECT ${columns} FROM ${table}
      WHERE control_schedule <> '' AND closed_at IS NULL ORDER BY id`)
      .all().map(withControlSchedule);
  }

  calendarRecords({ from, to, closed }) {
    const { table, extraColumns } = this.config;
    const deadline = EFFECTIVE_INSTRUCTION_DEADLINE_SQL;
    // Marks survive changes to either bound. Check their dates independently
    // of the current document period, including when its schedule is archived.
    const activePeriod = closed ? '' : `(control_date <= $to AND ${deadline} >= $from) OR`;
    return this.database.connection.prepare(`SELECT id, title, instruction_number AS instructionNumber, executor, status,
      ${extraColumns ? extraColumns + ',' : ''} ${deadline} AS deadline, control_schedule AS controlSchedule
      FROM ${table} WHERE closed_at IS ${closed ? 'NOT NULL' : 'NULL'} AND (
        ${deadline} BETWEEN $from AND $to OR (control_schedule <> '' AND (
          ${activePeriod} EXISTS (SELECT 1 FROM json_each(NULLIF(control_schedule, ''), '$.marks') AS mark
            WHERE json_extract(mark.value, '$.date') BETWEEN $from AND $to)
        ))
      )`).iterate({ from, to });
  }

  get(id) {
    validateId(id);
    const { columns, table } = this.config;
    const row = this.database.connection.prepare(`SELECT ${columns}, control_schedule AS controlSchedule FROM ${table} WHERE id = ?`).get(id);
    return row ? withControlSchedule(row) : null;
  }

  create(value) {
    const { validate, toRecord, table } = this.config;
    const data = validate(value);
    const now = new Date().toISOString();
    const record = { ...toRecord(data), created_at: now, updated_at: now };
    const columns = Object.keys(record);
    const placeholders = columns.map(() => '?').join(', ');
    const result = this.database.connection.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(...Object.values(record));
    return this.get(Number(result.lastInsertRowid));
  }

  update(id, changes) {
    const { validate, toRecord, table, notFound } = this.config;
    const existing = this.get(id);
    if (!existing) throw new AppError(notFound, 'NOT_FOUND');
    validateRecord(changes, 'Изменения записи');
    const data = validate({ ...existing, ...changes });
    const record = { ...toRecord(data), updated_at: new Date().toISOString() };
    const assignments = Object.keys(record).map(column => `${column} = ?`).join(', ');
    this.database.connection.prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`).run(...Object.values(record), id);
    return this.get(id);
  }

  closeControl(id) {
    validateId(id);
    const now = new Date().toISOString();
    this.database.connection.prepare(`UPDATE ${this.config.table} SET closed_at = ?, updated_at = ?
      WHERE id = ? AND closed_at IS NULL`).run(now, now, id);
    const record = this.get(id);
    if (!record) throw new AppError(this.config.notFound, 'NOT_FOUND');
    return record;
  }

  remove(id) {
    validateId(id);
    const result = this.database.connection.prepare(`DELETE FROM ${this.config.table} WHERE id = ?`).run(id);
    if (!result.changes) throw new AppError(this.config.notFound, 'NOT_FOUND');
    return { removed: true };
  }
}
