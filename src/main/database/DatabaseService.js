import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareConnection, discardConnection } from './prepareConnection.js';
import { AppError } from '../utils/AppError.js';
import { runTransaction } from './transaction.js';

export class DatabaseService {
  #connection = null;
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
    catch (error) { discardConnection({ connection, created }, filePath); throw error; }
    const oldConnection = this.#connection;
    this.#connection = connection;
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

  getStatus() {
    return {
      ready: this.#connection !== null, engine: 'SQLite', filePath: this.filePath,
      generation: this.#generation, message: this.message,
      sqliteVersion: this.#connection?.prepare('SELECT sqlite_version() AS version').get().version ?? null,
      schemaVersion: this.#connection?.prepare('PRAGMA user_version').get().user_version ?? null,
    };
  }

  close() {
    if (!this.#connection) return;
    this.#connection.close();
    this.#connection = null;
    this.#generation++;
  }
}
