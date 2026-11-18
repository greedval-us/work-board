import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from './sqlite.js';
import { migrations } from './migrations.js';
import { matchesHistoricalSchema } from './recovery/historicalSchema.js';
import { inspectWal, usesWal } from './recovery/inspectWal.js';
import { DATABASE_CONFIG, REQUIRED_DATABASE_COLUMNS } from './databaseConfig.js';
import { AppError } from '../errors/AppError.js';
import { publicError } from '../errors/publicError.js';
import { ERROR_CODES } from '../../shared/errors.js';

function hasSettingsSchema(connection, tables) {
  const columns = tables.includes('app_settings') ? connection.prepare('PRAGMA table_info(app_settings)').all() : [];
  return columns.length === 2 && columns[0].name === 'key' && columns[1].name === 'value'
    && columns[0].type === 'TEXT' && columns[1].type === 'TEXT' && columns[0].pk === 1;
}

function inspectSchema(connection, tables, version) {
  for (const [table, versions] of Object.entries(REQUIRED_DATABASE_COLUMNS)) {
    const expected = Object.entries(versions).flatMap(([introduced, columns]) => version >= Number(introduced) ? columns : []);
    if (!expected.length) continue;
    const actual = tables.includes(table) ? connection.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name) : [];
    if (!expected.every(column => actual.includes(column))) throw new AppError('Структура базы повреждена или не соответствует версии приложения.', 'DATABASE_INVALID');
  }
}

export function inspectConnection(connection) {
  const version = connection.prepare('PRAGMA user_version').get().user_version;
  const latest = migrations.at(-1)?.version ?? 0;
  if (version > latest) throw new AppError('Версия базы данных новее версии приложения.', 'DATABASE_NEWER');
  const identity = connection.prepare('PRAGMA application_id').get().application_id;
  const foreign = () => new AppError('Выбранный файл не является базой Work Board.', 'DATABASE_FOREIGN');
  if (identity === 0) {
    if (!matchesHistoricalSchema(connection, version)) throw foreign();
    if (connection.prepare('PRAGMA integrity_check(1)').get().integrity_check !== 'ok'
      || connection.prepare('PRAGMA foreign_key_check').get()) {
      throw new AppError('Проверка целостности старой базы не пройдена.', 'DATABASE_INVALID');
    }
  } else {
    if (identity !== DATABASE_CONFIG.APPLICATION_ID) throw foreign();
    const tables = connection.prepare("SELECT name FROM main.sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").all().map(row => row.name);
    if (!hasSettingsSchema(connection, tables)) throw foreign();
    inspectSchema(connection, tables, version);
    if (connection.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new AppError('Файл базы данных повреждён.', 'DATABASE_INVALID');
  }
  return { needsWrite: identity === 0 || version < latest };
}

export function inspectDatabase(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new AppError('Файл базы не найден. Выберите его расположение или откройте другую базу.', 'DATABASE_MISSING');
  try {
    if (usesWal(filePath)) return inspectWal(filePath, inspectConnection);
    const connection = new DatabaseSync(filePath, { readOnly: true });
    try { return inspectConnection(connection); }
    finally { connection.close(); }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const { code, message } = publicError(error, ERROR_CODES.DATABASE_INVALID);
    throw new AppError(message, code, { cause: error });
  }
}
