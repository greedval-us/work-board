import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.js';
import { DATABASE_CONFIG } from './databaseConfig.js';
import { inspectDatabase } from './inspectDatabase.js';
import { AppError } from '../utils/AppError.js';

export function discardConnection({ connection, created }, filePath) {
  connection?.close();
  if (created) rmSync(filePath, { force: true });
}

export function prepareConnection(filePath, create) {
  let created = false;
  let connection;
  try {
    if (create) {
      mkdirSync(path.dirname(filePath), { recursive: true });
      try { closeSync(openSync(filePath, 'wx')); created = true; }
      catch (error) {
        if (error.code === 'EEXIST') throw new AppError('Этот файл уже существует. Используйте «Открыть базу» или выберите другое имя.', 'DATABASE_EXISTS', { cause: error });
        throw error;
      }
    } else inspectDatabase(filePath);
    connection = new DatabaseSync(filePath);
    connection.exec(`PRAGMA busy_timeout = ${DATABASE_CONFIG.BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`);
    migrate(connection);
    connection.exec(`PRAGMA application_id = ${DATABASE_CONFIG.APPLICATION_ID}`);
    return { connection, created };
  } catch (error) { discardConnection({ connection, created }, filePath); throw error; }
}
