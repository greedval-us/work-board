import { IPC_CHANNELS as channels } from '../../shared/ipc/channels.js';

export class AppHandler {
  constructor(appService, database) { this.appService = appService; this.database = database; }
  requests() {
    return {
      [channels.app.getInfo]: () => this.appService.getInfo(),
      [channels.database.getStatus]: () => this.database.getStatus(),
    };
  }
}
