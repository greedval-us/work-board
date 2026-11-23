import { DatabaseSync } from '../sqlite.js';
import { migrations } from '../migrations.js';
import { DATABASE_CONFIG } from '../databaseConfig.js';

function schemaObjects(connection) {
  // SQLite's own statistics may be added by ANALYZE. All application tables,
  // indexes (including implicit ones), triggers and views must match.
  const objects = connection.prepare(`SELECT type, name, tbl_name, sql FROM main.sqlite_schema
    WHERE name NOT IN ('sqlite_stat1', 'sqlite_stat2', 'sqlite_stat3', 'sqlite_stat4')
    ORDER BY type, name`).all();
  return JSON.stringify(objects.map(({ type, name, tbl_name, sql }) => [
    type, name, tbl_name,
    // Ignore layout between SQL tokens, preserving string literals and their contents.
    sql?.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_0-9]+|[^\s]/gu) ?? null,
  ]));
}

export function matchesHistoricalSchema(connection, version) {
  if (version < 1 || version > DATABASE_CONFIG.LAST_RECOVERABLE_UNSIGNED_VERSION) return false;
  const reference = new DatabaseSync(':memory:');
  try {
    // Only execute the application's published migration SQL on this reference.
    for (const migration of migrations) {
      if (migration.version > version) break;
      reference.exec(migration.sql);
    }
    return schemaObjects(connection) === schemaObjects(reference);
  } finally { reference.close(); }
}
