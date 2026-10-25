import { randomUUID } from 'node:crypto';
import { constants, mkdirSync, renameSync, realpathSync, lstatSync } from 'node:fs';
import { copyFile, stat, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { ATTACHMENT_FILE_NAME_PATTERN, ATTACHMENT_STORAGE, DATABASE_FILE_SUFFIXES } from '../../shared/constants/attachments.js';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { ValidationError } from '../../shared/registry.js';
import { AppError } from '../utils/AppError.js';

// Owns a single save's temporary files, including compensation after SQL rollback.
class AttachmentWriteBatch {
  #staged = [];
  #installed = [];
  #committed = false;

  constructor(storage, root) {
    this.storage = storage;
    this.root = root;
    this.directory = path.join(root, ATTACHMENT_STORAGE.STAGING_DIRECTORY, randomUUID());
  }

  async stage(files, assertCurrent) {
    if (files.length) {
      this.storage.checkDirectories(this.root, this.directory);
      mkdirSync(this.directory, { recursive: true });
    }
    for (const file of files) {
      const temporary = path.join(this.directory, randomUUID());
      this.#staged.push(temporary);
      await copyFile(file.source, temporary, constants.COPYFILE_EXCL);
      assertCurrent();
    }
  }

  install(index, entityType, entityId, name) {
    const relativePath = `${entityType}/${entityId}/${randomUUID()}`;
    const destination = this.storage.storedPath(this.root, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    renameSync(this.#staged[index], destination);
    this.#installed.push(destination);
    return { name, size: lstatSync(destination).size, relativePath };
  }

  commit() { this.#committed = true; }

  async dispose() {
    await this.storage.cleanup([...this.#staged, ...(this.#committed ? [] : this.#installed)]);
    try { await rmdir(this.directory); } catch { /* Absent or still in use. */ }
  }
}

// Filesystem access and path policy stay outside record persistence and token state.
export class AttachmentStorage {
  constructor({ database, logger = { error() {} } }) {
    Object.assign(this, { database, logger });
  }

  root() { return `${this.database.filePath}${ATTACHMENT_STORAGE.ROOT_SUFFIX}`; }

  #databaseFiles(databasePath) {
    return DATABASE_FILE_SUFFIXES.map(suffix => `${databasePath}${suffix}`);
  }

  async inspectSources(sources, assertCurrent) {
    const files = [];
    for (const source of sources) {
      const info = await stat(source);
      assertCurrent();
      if (!info.isFile()) throw new ValidationError('Выберите обычный файл.');
      const canonical = realpathSync(source).toLowerCase();
      const databasePath = realpathSync(this.database.filePath).toLowerCase();
      if (this.#databaseFiles(databasePath).includes(canonical)) throw new ValidationError('Рабочую базу данных нельзя прикреплять как вложение.');
      files.push({ source, name: path.basename(source), size: info.size });
    }
    return files;
  }

  storedPath(root, relative) {
    const parts = typeof relative === 'string' ? relative.split('/') : [];
    if (parts.length !== 3 || !Object.values(ENTITY_TYPES).includes(parts[0]) || !/^[1-9]\d*$/.test(parts[1]) || !ATTACHMENT_FILE_NAME_PATTERN.test(parts[2])) {
      throw new AppError('Путь вложения повреждён.', 'VALIDATION');
    }
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new AppError('Путь вложения повреждён.', 'VALIDATION');
    this.checkDirectories(root, path.dirname(resolved));
    try { if (lstatSync(resolved).isSymbolicLink()) throw new AppError('Ссылка вместо файла вложения недопустима.', 'VALIDATION'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return resolved;
  }

  // Check every existing component: a junction must not escape managed storage.
  checkDirectories(root, directory) {
    let current = path.resolve(root);
    for (const part of ['', ...path.relative(root, directory).split(path.sep).filter(Boolean)]) {
      current = path.join(current, part);
      try {
        if (lstatSync(current).isSymbolicLink() || realpathSync(current).toLowerCase() !== path.resolve(current).toLowerCase()) {
          throw new AppError('Папка вложений содержит внешнюю ссылку.', 'VALIDATION');
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  paths(files) {
    const root = this.root();
    return files.map(file => this.storedPath(root, file.relativePath));
  }

  createBatch() { return new AttachmentWriteBatch(this, this.root()); }

  async cleanup(files) {
    for (const file of files) {
      try { await unlink(file); }
      catch (error) { if (error.code !== 'ENOENT') this.logger.error('Не удалось удалить файл вложения.', error); }
      try { await rmdir(path.dirname(file)); } catch { /* Other attachments may remain. */ }
    }
  }

  async prepareDownload(file) {
    const root = this.root();
    const source = this.storedPath(root, file.relativePath);
    try { if (!(await stat(source)).isFile()) throw new Error('not a file'); }
    catch { throw new AppError('Файл вложения не найден. Проверьте папку рядом с базой данных.', 'NOT_FOUND'); }
    return { root, source, relativePath: file.relativePath };
  }

  async download(prepared, filePath, assertCurrent) {
    const destination = path.resolve(filePath);
    const databasePath = path.resolve(this.database.filePath).toLowerCase();
    const lower = destination.toLowerCase();
    if (this.#databaseFiles(databasePath).includes(lower) || lower.startsWith(path.resolve(prepared.root).toLowerCase() + path.sep)) {
      throw new ValidationError('Выберите место вне рабочей базы и папки вложений.');
    }
    const temporary = path.join(path.dirname(destination), `.${randomUUID()}${ATTACHMENT_STORAGE.DOWNLOAD_TEMP_SUFFIX}`);
    try {
      this.storedPath(prepared.root, prepared.relativePath);
      await copyFile(prepared.source, temporary, constants.COPYFILE_EXCL);
      assertCurrent();
      renameSync(temporary, destination);
    } finally {
      try { await unlink(temporary); }
      catch (error) { if (error.code !== 'ENOENT') this.logger.error('Не удалось удалить временный файл.', error); }
    }
  }
}
