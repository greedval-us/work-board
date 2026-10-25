import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';
import { DATABASE_CONFIG, REQUIRED_DATABASE_COLUMNS } from './databaseConfig.js';
import { AppError } from '../utils/AppError.js';

function hasSettingsSchema(connection, tables) {
  const columns = tables.includes('app_settings') ? connection.prepare('PRAGMA table_info(app_settings)').all() : [];
  return columns.length === 2 && columns[0].name === 'key' && columns[1].name === 'value'
    && columns[0].type === 'TEXT' && columns[1].type === 'TEXT' && columns[0].pk === 1;
}

function inspectSchema(connection, tables, version) {
  for (const [table, expected] of Object.entries(REQUIRED_DATABASE_COLUMNS)) {
    const introduced = table === 'attachments' ? DATABASE_CONFIG.ATTACHMENTS_SCHEMA_VERSION : DATABASE_CONFIG.REGISTRY_SCHEMA_VERSION;
    if (version < introduced) continue;
    const actual = tables.includes(table) ? connection.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name) : [];
    if (!expected.every(column => actual.includes(column))) throw new AppError('Структура базы повреждена или не соответствует версии приложения.', 'DATABASE_INVALID');
  }
}

// This boundary never changes a candidate file, including an unrelated SQLite DB.
export function inspectDatabase(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new AppError('Файл базы не найден. Выберите его расположение или откройте другую базу.', 'DATABASE_MISSING');
  let connection;
  try {
    connection = new DatabaseSync(filePath, { readOnly: true });
    const version = connection.prepare('PRAGMA user_version').get().user_version;
    if (version > (migrations.at(-1)?.version ?? 0)) throw new AppError('Версия базы данных новее версии приложения.', 'DATABASE_NEWER');
    const identity = connection.prepare('PRAGMA application_id').get().application_id;
    const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    const legacy = identity === 0 && version === DATABASE_CONFIG.LEGACY_SCHEMA_VERSION && tables.length === 1 && tables[0] === 'app_settings';
    if (!hasSettingsSchema(connection, tables) || (!legacy && identity !== DATABASE_CONFIG.APPLICATION_ID)) throw new AppError('Выбранный файл не является базой Work Board.', 'DATABASE_FOREIGN');
    inspectSchema(connection, tables, version);
    if (connection.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new AppError('Файл базы данных повреждён.', 'DATABASE_INVALID');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Не удалось открыть выбранный файл как базу Work Board.', 'DATABASE_INVALID', { cause: error });
  } finally { connection?.close(); }
}
