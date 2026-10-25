import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';
import { AppError } from '../utils/AppError.js';

const RECORD_OPERATIONS = Object.freeze(['list', 'get', 'create', 'update', 'remove']);
const ATTACHMENT_OPERATIONS = Object.freeze(['list', 'pick', 'release', 'download']);

export class BusinessHandler {
  constructor({ database, recordServices = {}, calendar, exportService, attachments, analytics }) {
    Object.assign(this, { database, recordServices, calendar, exportService, attachments, analytics });
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
    for (const [entityType, service] of Object.entries(this.recordServices)) {
      for (const method of RECORD_OPERATIONS) requests[channels[entityType][method]] = this.guarded(payload => service[method](payload));
    }
    requests[channels.instructions.export] = this.guarded((payload) => this.exportService.export(payload));
    requests[channels.calendar.month] = this.guarded((payload) => this.calendar.month(payload));
    requests[channels.calendar.day] = this.guarded((payload) => this.calendar.day(payload));
    if (this.attachments) for (const method of ATTACHMENT_OPERATIONS) requests[channels.attachments[method]] = this.guarded(payload => this.attachments[method](payload));
    if (this.analytics) requests[channels.analytics.summary] = this.guarded(payload => this.analytics.summary(payload));
    return requests;
  }
}
