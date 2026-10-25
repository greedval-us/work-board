import { DatabaseService } from './database/DatabaseService.js';
import { DatabaseLocation } from './database/DatabaseLocation.js';
import { SettingsRepository } from './repositories/SettingsRepository.js';
import { InstructionRepository } from './repositories/InstructionRepository.js';
import { TaskRepository } from './repositories/TaskRepository.js';
import { SettingsService } from './services/SettingsService.js';
import { AppService } from './services/AppService.js';
import { DatabaseSelectionService } from './services/DatabaseSelectionService.js';
import { CalendarService } from './services/CalendarService.js';
import { ExcelExportService } from './services/ExcelExportService.js';
import { IPCManager } from './ipc/IPCManager.js';

// Composition root: platform dependencies enter here; repositories and services
// do not create windows or discover each other through global state.
export function createApplicationServices({ app, ipcMain, dialog, getWindow, logger }) {
  const database = new DatabaseService();
  let ipc;
  try {
    const location = new DatabaseLocation({ userData: app.getPath('userData'), database });
    location.restore();
    const instructions = new InstructionRepository(database);
    const tasks = new TaskRepository(database);
    ipc = new IPCManager({
      ipcMain, database, appService: new AppService(app),
      settingsService: new SettingsService(new SettingsRepository(database)),
      instructions, tasks, calendar: new CalendarService(instructions, tasks),
      selection: new DatabaseSelectionService({ database, location, dialog, getWindow }),
      exportService: new ExcelExportService({ database, instructions, dialog, getWindow }),
      getWindow, logger,
    });
    ipc.init();
  } catch (cause) {
    ipc?.shutdown();
    database.close();
    throw cause;
  }
  return {
    shutdown() {
      try { ipc.shutdown(); }
      finally { database.close(); }
    },
  };
}
