import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate, migrations } from './migrations.js';
import { AppError } from '../utils/AppError.js';

const APPLICATION_ID = 0x57424f41;

function inspectExisting(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new AppError('Файл базы не найден. Выберите его расположение или откройте другую базу.', 'DATABASE_MISSING');
  }
  let connection;
  try {
    connection = new DatabaseSync(filePath, { readOnly: true });
    const version = connection.prepare('PRAGMA user_version').get().user_version;
    if (version > (migrations.at(-1)?.version ?? 0)) throw new AppError('Версия базы данных новее версии приложения.', 'DATABASE_NEWER');
    const identity = connection.prepare('PRAGMA application_id').get().application_id;
    const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
    const legacy = identity === 0 && version === 1 && tables.length === 1 && tables[0] === 'app_settings';
    const columns = tables.includes('app_settings') ? connection.prepare('PRAGMA table_info(app_settings)').all() : [];
    const knownSettings = columns.length === 2 && columns[0].name === 'key' && columns[1].name === 'value'
      && columns[0].type === 'TEXT' && columns[1].type === 'TEXT' && columns[0].pk === 1;
    if (!knownSettings || (!legacy && identity !== APPLICATION_ID)) {
      throw new AppError('Выбранный файл не является базой Work Board.', 'DATABASE_FOREIGN');
    }
    if (version >= 2) {
      const required = {
        instructions: ['id', 'control_date', 'incoming_number', 'instruction_number', 'title', 'summary', 'deadline', 'executor', 'status', 'execution_mark', 'instruction_number_search', 'executor_search', 'execution_mark_search', 'created_at', 'updated_at'],
        calendar_tasks: ['id', 'title', 'date', 'description', 'priority', 'completed', 'created_at', 'updated_at'],
      };
      for (const [table, expected] of Object.entries(required)) {
        const actual = tables.includes(table) ? connection.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name) : [];
        if (!expected.every(column => actual.includes(column))) {
          throw new AppError('Структура базы повреждена или не соответствует версии приложения.', 'DATABASE_INVALID');
        }
      }
    }
    if (connection.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new AppError('Файл базы данных повреждён.', 'DATABASE_INVALID');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Не удалось открыть выбранный файл как базу Work Board.', 'DATABASE_INVALID', { cause: error });
  } finally { connection?.close(); }
}

function prepareConnection(filePath, create) {
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
    } else inspectExisting(filePath);
    connection = new DatabaseSync(filePath);
    connection.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    migrate(connection);
    connection.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    return { connection, created };
  } catch (error) {
    connection?.close();
    if (created) rmSync(filePath, { force: true });
    throw error;
  }
}

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
    catch (error) { connection.close(); if (created) rmSync(filePath, { force: true }); throw error; }
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
