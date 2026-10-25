import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';
import { AppError } from '../utils/AppError.js';

export class BusinessHandler {
  constructor({ database, instructions, tasks, calendar, exportService }) {
    Object.assign(this, { database, instructions, tasks, calendar, exportService });
  }

  guarded(operation) {
    return (payload) => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError('Некорректный запрос.', 'VALIDATION');
      this.database.assertGeneration(payload.generation);
      return operation(payload);
    };
  }

  requests() {
    const requests = {};
    for (const [namespace, repository] of [[channels.instructions, this.instructions], [channels.tasks, this.tasks]]) {
      requests[namespace.list] = this.guarded((payload) => repository.list(payload));
      requests[namespace.get] = this.guarded((payload) => repository.get(payload.id));
      requests[namespace.create] = this.guarded((payload) => repository.create(payload.data));
      requests[namespace.update] = this.guarded((payload) => repository.update(payload.id, payload.data));
      requests[namespace.remove] = this.guarded((payload) => repository.remove(payload.id));
    }
    requests[channels.instructions.export] = this.guarded((payload) => this.exportService.export(payload));
    requests[channels.calendar.month] = this.guarded((payload) => this.calendar.month(payload));
    requests[channels.calendar.day] = this.guarded((payload) => this.calendar.day(payload));
    return requests;
  }
}
