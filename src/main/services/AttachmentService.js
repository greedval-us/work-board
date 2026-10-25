import path from 'node:path';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { validateId, validateInstruction, validateTask, ValidationError } from '../../shared/registry.js';
import { AppError } from '../utils/AppError.js';

export class AttachmentService {
  constructor({ database, tasks, instructions, repository, selections, storage, dialog, getWindow }) {
    Object.assign(this, { database, repository, selections, storage, dialog, getWindow });
    this.owners = {
      [ENTITY_TYPES.TASKS]: { repository: tasks, validate: validateTask },
      [ENTITY_TYPES.INSTRUCTIONS]: { repository: instructions, validate: validateInstruction },
    };
  }

  assert(request) {
    this.database.assertGeneration(request.generation);
    this.owner(request.entityType);
  }

  owner(entityType) {
    if (!Object.hasOwn(this.owners, entityType)) throw new ValidationError('Некорректный тип записи для вложения.');
    return this.owners[entityType];
  }

  list(request) {
    this.assert(request);
    validateId(request.entityId);
    if (!this.owner(request.entityType).repository.get(request.entityId)) throw new AppError('Запись не найдена.', 'NOT_FOUND');
    return this.repository.list(request.entityType, request.entityId);
  }

  async pick(request) {
    this.assert(request);
    this.selections.begin(request.generation);
    const result = await this.dialog.showOpenDialog(this.getWindow(), { title: 'Прикрепить файлы', properties: ['openFile', 'multiSelections'] });
    this.assert(request);
    if (result.canceled) return { cancelled: true, files: [] };
    this.selections.assertCapacity(result.filePaths.length);
    const files = await this.storage.inspectSources(result.filePaths, () => this.assert(request));
    this.assert(request);
    return { cancelled: false, files: this.selections.register(files, request) };
  }

  release(request) {
    this.assert(request);
    return this.selections.release(request.tokens, request);
  }

  async save(request) {
    this.assert(request);
    if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) throw new ValidationError('Некорректные данные записи.');
    const owner = this.owner(request.entityType);
    const existingRecord = request.id == null ? null : owner.repository.get(request.id);
    if (request.id != null && !existingRecord) throw new AppError('Запись не найдена.', 'NOT_FOUND');
    const data = owner.validate({ ...existingRecord, ...request.data });
    const existing = existingRecord ? this.repository.list(request.entityType, request.id) : [];
    const { additions, removals } = this.selections.changes(request.data.attachments, request, existing);
    const removedPaths = this.storage.paths(removals);
    const batch = this.storage.createBatch();
    try {
      if (additions.length) await batch.stage(additions, () => this.assert(request));
      this.assert(request);
      const saved = this.database.transaction(() => {
        // Update merges partial changes with the current row inside this transaction.
        const record = existingRecord ? owner.repository.update(request.id, request.data) : owner.repository.create(data);
        for (const [index, file] of additions.entries()) {
          const metadata = batch.install(index, request.entityType, record.id, file.name);
          this.repository.insert(request.entityType, record.id, metadata);
        }
        for (const file of removals) this.repository.remove(file.id);
        return record;
      });
      batch.commit();
      this.selections.consume(additions);
      await this.storage.cleanup(removedPaths);
      return saved;
    } finally { await batch.dispose(); }
  }

  async remove(request) {
    this.assert(request);
    validateId(request.id);
    const files = this.storage.paths(this.repository.list(request.entityType, request.id));
    const result = this.owner(request.entityType).repository.remove(request.id);
    await this.storage.cleanup(files);
    return result;
  }

  async download(request) {
    const file = this.list(request).find(item => item.id === validateId(request.id));
    if (!file) throw new AppError('Вложение не найдено.', 'NOT_FOUND');
    const prepared = await this.storage.prepareDownload(file);
    this.assert(request);
    const result = await this.dialog.showSaveDialog(this.getWindow(), { title: 'Скачать вложение', defaultPath: path.basename(file.name), properties: ['createDirectory', 'showOverwriteConfirmation'] });
    this.assert(request);
    if (result.canceled || !result.filePath) return { cancelled: true };
    await this.storage.download(prepared, result.filePath, () => this.assert(request));
    return { cancelled: false };
  }
}
