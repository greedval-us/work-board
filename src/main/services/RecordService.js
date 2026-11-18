import { ValidationError } from '../../shared/errors.js';
import { validateId } from '../../shared/validation.js';

function checkRecordData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ValidationError('Некорректные данные записи.');
}

// One record type per instance; IPC does not decide how business writes persist.
export class RecordService {
  constructor({ database, repository }) {
    this.database = database;
    this.repository = repository;
  }

  list(request) { return this.repository.list(request); }
  get({ id, date }) { return this.repository.get(id, date); }
  create({ data }) {
    checkRecordData(data);
    return this.database.transaction(() => this.repository.create(data));
  }
  update({ id, data, occurrence }) {
    validateId(id);
    checkRecordData(data);
    return this.database.transaction(() => this.repository.update(id, data, occurrence));
  }
  setOccurrenceCompleted({ id, date, completed }) {
    return this.database.transaction(() => this.repository.updateOccurrence(id, date, completed));
  }
  moveOccurrence({ id, from, to }) {
    return this.database.transaction(() => this.repository.moveOccurrence(id, from, to));
  }
  closeControl({ id }) { return this.repository.closeControl(id); }
  remove({ id }) { return this.repository.remove(id); }
}
