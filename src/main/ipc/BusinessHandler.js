import { IPC_CHANNELS as channels } from '../../shared/ipc/channels.js';
import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { AppError } from '../errors/AppError.js';

const RECORD_OPERATIONS = Object.freeze(['list', 'get', 'create', 'update', 'remove']);

export class BusinessHandler {
  constructor({ database, recordServices = {}, calendar, exportService, planExport, controlCardExport, analytics, planAnalytics, notifications }) {
    Object.assign(this, { database, recordServices, calendar, exportService, planExport, controlCardExport, analytics, planAnalytics, notifications });
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
    for (const entity of [ENTITY_TYPES.INSTRUCTIONS, ENTITY_TYPES.PLANS]) {
      const records = this.recordServices[entity];
      if (records) requests[channels[entity].closeControl] = this.guarded(payload => records.closeControl(payload));
    }
    const tasks = this.recordServices[ENTITY_TYPES.TASKS];
    if (tasks) {
      requests[channels.tasks.setOccurrenceCompleted] = this.guarded(payload => tasks.setOccurrenceCompleted(payload));
      requests[channels.tasks.moveOccurrence] = this.guarded(payload => tasks.moveOccurrence(payload));
    }
    requests[channels.instructions.export] = this.guarded((payload) => this.exportService.export(payload));
    if (this.planExport) requests[channels.plans.export] = this.guarded(payload => this.planExport.export(payload));
    if (this.controlCardExport) requests[channels.instructions.exportControlCard] = this.guarded(payload => this.controlCardExport.export(payload));
    requests[channels.calendar.month] = this.guarded((payload) => this.calendar.month(payload));
    requests[channels.calendar.day] = this.guarded((payload) => this.calendar.day(payload));
    requests[channels.calendar.year] = this.guarded(payload => this.calendar.year(payload));
    if (this.analytics) requests[channels.analytics.summary] = this.guarded(payload => this.analytics.summary(payload));
    if (this.planAnalytics) requests[channels.analytics.planSummary] = this.guarded(payload => this.planAnalytics.summary(payload));
    if (this.notifications) {
      requests[channels.notifications.list] = this.guarded(() => this.notifications.list());
      requests[channels.notifications.acknowledge] = this.guarded(payload => this.notifications.acknowledge(payload));
    }
    return requests;
  }
}
