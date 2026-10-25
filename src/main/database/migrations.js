import { runTransaction } from './transaction.js';

// Add sequential versions here. Each migration runs once in its own transaction.
export const migrations = [
  {
    version: 1,
    sql: `CREATE TABLE app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) STRICT;`,
  },
  {
    version: 2,
    sql: `CREATE TABLE instructions (
      id INTEGER PRIMARY KEY,
      control_date TEXT NOT NULL,
      incoming_number TEXT NOT NULL DEFAULT '',
      instruction_number TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      deadline TEXT NOT NULL,
      executor TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
      execution_mark TEXT NOT NULL DEFAULT '',
      instruction_number_search TEXT NOT NULL,
      executor_search TEXT NOT NULL,
      execution_mark_search TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX instructions_deadline_status_idx ON instructions (deadline, status);
    CREATE INDEX instructions_status_idx ON instructions (status);
    CREATE INDEX instructions_control_date_idx ON instructions (control_date);
    CREATE TABLE calendar_tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX calendar_tasks_date_completed_idx ON calendar_tasks (date, completed);`,
  },
  {
    version: 3,
    sql: `CREATE TABLE attachments (
      id INTEGER PRIMARY KEY,
      instruction_id INTEGER REFERENCES instructions(id) ON DELETE CASCADE,
      task_id INTEGER REFERENCES calendar_tasks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL UNIQUE,
      size INTEGER NOT NULL CHECK (size >= 0),
      created_at TEXT NOT NULL,
      CHECK ((instruction_id IS NOT NULL AND task_id IS NULL) OR (instruction_id IS NULL AND task_id IS NOT NULL))
    ) STRICT;
    CREATE INDEX attachments_instruction_idx ON attachments(instruction_id);
    CREATE INDEX attachments_task_idx ON attachments(task_id);`,
  },
];

export function migrate(database) {
  const current = database.prepare('PRAGMA user_version').get().user_version;
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) throw new Error('Версия базы данных новее версии приложения.');
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    runTransaction(database, () => {
      database.exec(migration.sql);
      database.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
