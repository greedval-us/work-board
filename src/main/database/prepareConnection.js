import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openExistingDatabase } from './sqlite.js';
import { applyMigrations } from './migrations.js';
import { runTransaction } from './transaction.js';
import { DATABASE_CONFIG } from './databaseConfig.js';
import { inspectConnection, inspectDatabase } from './inspectDatabase.js';
import { AppError } from '../errors/AppError.js';
import { rethrowAfterCleanup } from '../errors/cleanup.js';
import { publicError } from '../errors/publicError.js';
import { ERROR_CODES } from '../../shared/errors.js';

export function discardConnection({ connection, created }, filePath) {
  const removeCreatedFile = () => { if (created) rmSync(filePath, { force: true }); };
  try { connection?.close(); }
  catch (error) { rethrowAfterCleanup(error, [removeCreatedFile]); }
  removeCreatedFile();
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
    }
    const needsWrite = created || inspectDatabase(filePath).needsWrite;
    connection = openExistingDatabase(filePath);
    connection.exec(`PRAGMA busy_timeout = ${DATABASE_CONFIG.BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`);
    runTransaction(connection, () => {
      // Inspect the actual handle again. A different file or committed WAL
      // snapshot may have replaced the one observed during preflight.
      if (!created) inspectConnection(connection);
      applyMigrations(connection);
    }, { deferred: !needsWrite });
    connection.exec('PRAGMA journal_mode = WAL');
    return { connection, created };
  } catch (error) {
    const { code, message } = publicError(error);
    const failure = error instanceof AppError || code === ERROR_CODES.UNEXPECTED
      ? error : new AppError(message, code, { cause: error });
    rethrowAfterCleanup(failure, [() => discardConnection({ connection, created }, filePath)]);
  }
}
