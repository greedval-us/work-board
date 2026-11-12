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
import { ControlCardExportService } from './services/ControlCardExportService.js';
import { IPCManager } from './ipc/IPCManager.js';
import { AttachmentService } from './services/AttachmentService.js';
import { AnalyticsService } from './services/AnalyticsService.js';
import { AttachmentRepository } from './repositories/AttachmentRepository.js';
import { AttachmentSelections } from './attachments/AttachmentSelections.js';
import { AttachmentStorage } from './attachments/AttachmentStorage.js';
import { RecordService } from './services/RecordService.js';
import { ENTITY_TYPES } from '../shared/constants/entities.js';
import { AnalyticsRepository } from './repositories/AnalyticsRepository.js';
import { NotificationStateRepository } from './repositories/NotificationStateRepository.js';
import { NotificationService } from './services/NotificationService.js';
import { NativeNotificationScheduler } from './notifications/NativeNotificationScheduler.js';

// Composition root: platform dependencies enter here; repositories and services
// do not create windows or discover each other through global state.
export function createApplicationServices({ app, ipcMain, dialog, getWindow, logger, nativeNotifications, onNotificationOpen }) {
  const database = new DatabaseService();
  let ipc;
  let reminderScheduler;
  try {
    const location = new DatabaseLocation({ userData: app.getPath('userData'), database });
    location.restore();
    const instructions = new InstructionRepository(database);
    const tasks = new TaskRepository(database);
    const settings = new SettingsRepository(database);
    const notifications = new NotificationService({ instructions, tasks,
      repository: new NotificationStateRepository(database),
      getDeliveryStatus: () => reminderScheduler?.getStatus() ?? { mode: 'in-app', error: '' },
    });
    if (nativeNotifications) reminderScheduler = new NativeNotificationScheduler({
      ...nativeNotifications, database, notifications, logger, onOpen: onNotificationOpen,
    });
    const attachments = new AttachmentService({
      database, instructions, tasks, dialog, getWindow,
      repository: new AttachmentRepository(database),
      selections: new AttachmentSelections(),
      storage: new AttachmentStorage({ database, logger }),
    });
    const recordServices = {
      [ENTITY_TYPES.INSTRUCTIONS]: new RecordService({ entityType: ENTITY_TYPES.INSTRUCTIONS, repository: instructions, attachments }),
      [ENTITY_TYPES.TASKS]: new RecordService({ entityType: ENTITY_TYPES.TASKS, repository: tasks, attachments }),
    };
    ipc = new IPCManager({
      ipcMain, database, appService: new AppService(app),
      settingsService: new SettingsService(settings),
      recordServices, calendar: new CalendarService(instructions, tasks), attachments,
      analytics: new AnalyticsService({ repository: new AnalyticsRepository(database) }),
      notifications,
      selection: new DatabaseSelectionService({ database, location, dialog, getWindow }),
      exportService: new ExcelExportService({ database, instructions, dialog, getWindow }),
      controlCardExport: new ControlCardExportService({ database, instructions, settings, dialog, getWindow }),
      getWindow, logger, onDataChanged: () => reminderScheduler?.check(),
    });
    ipc.init();
  } catch (cause) {
    reminderScheduler?.stop();
    ipc?.shutdown();
    database.close();
    throw cause;
  }
  return {
    startNotifications() { return reminderScheduler?.start() ?? false; },
    checkNotifications() { reminderScheduler?.check(); },
    getNotificationStatus() { return reminderScheduler?.getStatus() ?? { mode: 'in-app', error: '' }; },
    shutdown() {
      try { reminderScheduler?.stop(); ipc.shutdown(); }
      finally { database.close(); }
    },
  };
}
