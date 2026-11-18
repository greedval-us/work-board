import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { AppError } from '../utils/AppError.js';

const RECORD_OPERATIONS = Object.freeze(['list', 'get', 'create', 'update', 'remove']);

export class BusinessHandler {
  constructor({ database, recordServices = {}, calendar, exportService, controlCardExport, analytics, notifications }) {
    Object.assign(this, { database, recordServices, calendar, exportService, controlCardExport, analytics, notifications });
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
    const instructions = this.recordServices[ENTITY_TYPES.INSTRUCTIONS];
    if (instructions) requests[channels.instructions.closeControl] = this.guarded(payload => instructions.closeControl(payload));
    const tasks = this.recordServices[ENTITY_TYPES.TASKS];
    if (tasks) {
      requests[channels.tasks.setOccurrenceCompleted] = this.guarded(payload => tasks.setOccurrenceCompleted(payload));
      requests[channels.tasks.moveOccurrence] = this.guarded(payload => tasks.moveOccurrence(payload));
    }
    requests[channels.instructions.export] = this.guarded((payload) => this.exportService.export(payload));
    if (this.controlCardExport) requests[channels.instructions.exportControlCard] = this.guarded(payload => this.controlCardExport.export(payload));
    requests[channels.calendar.month] = this.guarded((payload) => this.calendar.month(payload));
    requests[channels.calendar.day] = this.guarded((payload) => this.calendar.day(payload));
    if (this.analytics) requests[channels.analytics.summary] = this.guarded(payload => this.analytics.summary(payload));
    if (this.notifications) {
      requests[channels.notifications.list] = this.guarded(() => this.notifications.list());
      requests[channels.notifications.acknowledge] = this.guarded(payload => this.notifications.acknowledge(payload));
    }
    return requests;
  }
}
