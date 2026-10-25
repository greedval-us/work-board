import { validateId } from '../../shared/validation.js';

// One record type per instance; IPC does not decide how business writes persist.
export class RecordService {
  constructor({ entityType, repository, attachments }) {
    this.entityType = entityType;
    this.repository = repository;
    this.attachments = attachments;
  }

  list(request) { return this.repository.list(request); }
  get({ id }) { return this.repository.get(id); }
  create(request) { return this.attachments.save({ ...request, id: null, entityType: this.entityType }); }
  update(request) {
    validateId(request.id);
    return this.attachments.save({ ...request, entityType: this.entityType });
  }
  remove(request) {
    validateId(request.id);
    return this.attachments.remove({ ...request, entityType: this.entityType });
  }
}
