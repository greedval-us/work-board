import { ValidationError } from '../../shared/errors.js';

export class PlanningService {
  constructor({ database, repository }) {
    this.database = database;
    this.repository = repository;
  }

  list(request) { return this.repository.list(request); }
  get({ id }) { return this.repository.get(id); }

  create({ rows }) {
    if (!Array.isArray(rows) || !rows.length) throw new ValidationError('Добавьте хотя бы одну строку плана.');
    return this.database.transaction(() => Array.from(rows, row => this.repository.create(row)));
  }

  update({ id, data }) {
    return this.database.transaction(() => this.repository.update(id, data));
  }

  closeControl({ id }) { return this.repository.closeControl(id); }
  remove({ id }) { return this.repository.remove(id); }
}
