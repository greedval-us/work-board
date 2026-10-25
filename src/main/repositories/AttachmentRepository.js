import { validateId, ValidationError } from '../../shared/registry.js';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';

const OWNER_COLUMNS = Object.freeze({
  [ENTITY_TYPES.INSTRUCTIONS]: 'instruction_id',
  [ENTITY_TYPES.TASKS]: 'task_id',
});

export function ownerColumn(entityType) {
  if (!Object.hasOwn(OWNER_COLUMNS, entityType)) throw new ValidationError('Некорректный тип записи для вложения.');
  return OWNER_COLUMNS[entityType];
}

const COLUMNS = 'id, name, relative_path AS relativePath, size, created_at AS createdAt';
export class AttachmentRepository {
  constructor(database) { this.database = database; }
  list(entityType, entityId) {
    const column = ownerColumn(entityType); validateId(entityId);
    return this.database.connection.prepare(`SELECT ${COLUMNS} FROM attachments WHERE ${column} = ? ORDER BY id`).all(entityId).map(row => ({ ...row }));
  }
  insert(entityType, entityId, file) {
    const column = ownerColumn(entityType); validateId(entityId);
    this.database.connection.prepare(`INSERT INTO attachments (${column}, name, relative_path, size, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(entityId, file.name, file.relativePath, file.size, new Date().toISOString());
  }
  remove(id) { validateId(id); this.database.connection.prepare('DELETE FROM attachments WHERE id = ?').run(id); }
}
