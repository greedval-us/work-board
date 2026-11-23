import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareConnection, discardConnection } from './prepareConnection.js';
import { AppError } from '../errors/AppError.js';
import { runTransaction } from './transaction.js';
import { rethrowAfterCleanup } from '../errors/cleanup.js';

export class DatabaseService {
  #connection = null;
  #changeStatements = null;
  #generation = 0;

  constructor({ filePath = null } = {}) { this.filePath = filePath; this.message = ''; }

  get connection() {
    if (!this.#connection) throw new AppError('База данных не открыта. Создайте или выберите базу в настройках.', 'DATABASE_REQUIRED');
    return this.#connection;
  }

  open() {
    if (this.#connection) return;
    if (!this.filePath) throw new AppError('Сначала выберите файл базы данных.', 'DATABASE_REQUIRED');
    this.replace({ filePath: this.filePath, create: !existsSync(this.filePath) });
  }

  replace({ filePath, create = false, persist = () => {} }) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new AppError('Некорректный путь базы данных.');
    filePath = path.resolve(filePath);
    if (!create && this.#connection && this.filePath === filePath) { persist(filePath); return this.getStatus(); }
    const { connection, created } = prepareConnection(filePath, create);
    try { persist(filePath); }
    catch (error) { rethrowAfterCleanup(error, [() => discardConnection({ connection, created }, filePath)]); }
    const oldConnection = this.#connection;
    this.#connection = connection;
    this.#changeStatements = null;
    this.filePath = filePath;
    this.message = '';
    this.#generation++;
    oldConnection?.close();
    return this.getStatus();
  }

  assertGeneration(generation) {
    void this.connection;
    if (generation !== this.#generation) throw new AppError('Активная база изменилась. Обновите данные и повторите действие.', 'DATABASE_CHANGED');
  }

  transaction(operation) {
    return runTransaction(this.connection, operation);
  }

  get connectionState() {
    return { ready: this.#connection !== null, generation: this.#generation };
  }

  get changeStamp() {
    const connection = this.connection;
    // data_version detects other connections' commits; total_changes() covers this connection.
    this.#changeStatements ??= {
      external: connection.prepare('PRAGMA main.data_version'),
      local: connection.prepare('SELECT total_changes() AS count'),
    };
    const { external, local } = this.#changeStatements;
    return { external: external.get().data_version, local: local.get().count };
  }

  getStatus() {
    return {
      ...this.connectionState, engine: 'SQLite', filePath: this.filePath, message: this.message,
      sqliteVersion: this.#connection?.prepare('SELECT sqlite_version() AS version').get().version ?? null,
      schemaVersion: this.#connection?.prepare('PRAGMA user_version').get().user_version ?? null,
    };
  }

  close() {
    if (!this.#connection) return;
    this.#connection.close();
    this.#connection = null;
    this.#changeStatements = null;
    this.#generation++;
  }
}
