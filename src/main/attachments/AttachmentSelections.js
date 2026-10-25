import { randomUUID } from 'node:crypto';
import { ATTACHMENT_LIMITS } from '../../shared/constants/attachments.js';
import { validateId, ValidationError } from '../../shared/registry.js';

// Tokens grant access only to files selected for the current database and owner type.
export class AttachmentSelections {
  #files = new Map();
  #generation;

  begin(generation) {
    if (this.#generation === generation) return;
    this.#files.clear();
    this.#generation = generation;
  }

  assertCapacity(count) {
    if (count > ATTACHMENT_LIMITS.FILES_PER_PICK || this.#files.size + count > ATTACHMENT_LIMITS.PENDING_SELECTIONS) {
      throw new ValidationError(`Выберите не более ${ATTACHMENT_LIMITS.FILES_PER_PICK} файлов за один раз.`);
    }
  }

  register(files, context) {
    this.begin(context.generation);
    this.assertCapacity(files.length);
    return files.map(file => {
      const selected = { token: randomUUID(), name: file.name, size: file.size };
      this.#files.set(selected.token, { ...selected, source: file.source, generation: context.generation, entityType: context.entityType });
      return selected;
    });
  }

  #belongsTo(selection, context) {
    return selection?.generation === context.generation && selection.entityType === context.entityType;
  }

  release(tokens, context) {
    if (!Array.isArray(tokens) || tokens.length > ATTACHMENT_LIMITS.RELEASE_TOKENS || tokens.some(token => typeof token !== 'string')) {
      throw new ValidationError('Некорректный список выбранных файлов.');
    }
    for (const token of tokens) {
      if (this.#belongsTo(this.#files.get(token), context)) this.#files.delete(token);
    }
    return { released: true };
  }

  changes(value, context, existing) {
    if (value === undefined) return { additions: [], removals: [] };
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('Некорректный список файлов.');
    const add = value.add ?? [];
    const remove = value.remove ?? [];
    if (!Array.isArray(add) || !Array.isArray(remove) || add.length > ATTACHMENT_LIMITS.CHANGES_PER_SAVE || remove.length > ATTACHMENT_LIMITS.CHANGES_PER_SAVE) {
      throw new ValidationError('Некорректный список файлов.');
    }
    const used = new Set();
    const additions = add.map(file => {
      const selection = this.#files.get(file?.token);
      if (!this.#belongsTo(selection, context) || used.has(file.token)) throw new ValidationError('Повторно выберите прикрепляемый файл.');
      used.add(file.token);
      return selection;
    });
    const removals = [...new Set(remove)].map(id => {
      validateId(id);
      const file = existing.find(item => item.id === id);
      if (!file) throw new ValidationError('Файл не принадлежит этой записи.');
      return file;
    });
    return { additions, removals };
  }

  consume(files) {
    for (const file of files) this.#files.delete(file.token);
  }
}
