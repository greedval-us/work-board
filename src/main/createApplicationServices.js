import path from 'node:path';
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
import { AnalyticsService } from './services/AnalyticsService.js';
import { RecordService } from './services/RecordService.js';
import { ENTITY_TYPES } from '../shared/constants/entities.js';
import { AnalyticsRepository } from './repositories/AnalyticsRepository.js';
import { NotificationStateRepository } from './repositories/NotificationStateRepository.js';
import { NotificationService } from './services/NotificationService.js';
import { NativeNotificationScheduler } from './desktop/notifications/NativeNotificationScheduler.js';
import { AppLockService } from './services/AppLockService.js';

const LOCK_CHECK_INTERVAL_MS = 1_000;

// Composition root: platform dependencies enter here; repositories and services
// do not create windows or discover each other through global state.
export function createApplicationServices({ app, ipcMain, dialog, getWindow, openPath, logger = console, nativeNotifications,
  onNotificationOpen, onAppLockStatusChange, now, hideLegacyNotificationPreviews = false }) {
  const database = new DatabaseService();
  let ipc;
  let reminderScheduler;
  let lockCheck;
  let lockEnabled;
  let appLock;
  try {
    const userData = app.getPath('userData');
    appLock = new AppLockService({ filePath: path.join(userData, 'app-lock.json'), now,
      onStatusChanged(status) {
        const active = status.enabled && !status.locked;
        if (active && lockCheck === undefined) {
          lockCheck = setInterval(() => appLock.getStatus(), LOCK_CHECK_INTERVAL_MS);
        } else if (!active && lockCheck !== undefined) {
          clearInterval(lockCheck);
          lockCheck = undefined;
        }
        const justEnabled = status.enabled && !lockEnabled;
        lockEnabled = status.enabled;
        if (status.locked || (justEnabled && hideLegacyNotificationPreviews)) reminderScheduler?.onAppLock();
        try { onAppLockStatusChange?.(status); }
        catch (error) { logger.error('Cannot publish application lock status.', error); }
      },
    });
    lockEnabled = appLock.getStatus().enabled;
    const location = new DatabaseLocation({ userData, database });
    location.restore();
    const instructions = new InstructionRepository(database);
    const tasks = new TaskRepository(database);
    const settings = new SettingsRepository(database);
    const assertUnlocked = () => appLock.assertUnlocked();
    const notifications = new NotificationService({ instructions, tasks,
      repository: new NotificationStateRepository(database),
      getDeliveryStatus: () => reminderScheduler?.getStatus() ?? { mode: 'in-app', error: '' },
    });
    if (nativeNotifications) reminderScheduler = new NativeNotificationScheduler({
      ...nativeNotifications, database, notifications, logger, onOpen: onNotificationOpen,
      isAppLocked: () => appLock.getStatus().locked,
      hidePreviews: () => hideLegacyNotificationPreviews && appLock.getStatus().enabled,
    });
    const recordServices = {
      [ENTITY_TYPES.INSTRUCTIONS]: new RecordService({ database, repository: instructions }),
      [ENTITY_TYPES.TASKS]: new RecordService({ database, repository: tasks }),
    };
    ipc = new IPCManager({
      ipcMain, database, appService: new AppService(app),
      settingsService: new SettingsService(settings),
      recordServices, calendar: new CalendarService(instructions, tasks),
      analytics: new AnalyticsService({ repository: new AnalyticsRepository(database) }),
      notifications,
      appLock,
      hasPendingNotifications() {
        if (!appLock.getStatus().locked || !database.connectionState.ready) return false;
        const delivery = reminderScheduler?.getStatus();
        if (delivery?.mode === 'system' && !delivery.error) return false;
        return notifications.list().items.some(item => item.popupPending);
      },
      selection: new DatabaseSelectionService({ database, location, dialog, getWindow, assertUnlocked }),
      exportService: new ExcelExportService({ database, instructions, dialog, getWindow, openPath, assertUnlocked }),
      controlCardExport: new ControlCardExportService({ database, instructions, settings, dialog, getWindow, openPath, assertUnlocked }),
      getWindow, logger, onDataChanged: () => reminderScheduler?.check(),
    });
    ipc.init();
  } catch (cause) {
    clearInterval(lockCheck);
    reminderScheduler?.stop();
    ipc?.shutdown();
    database.close();
    throw cause;
  }
  return {
    getAppLockStatus() { return appLock.getStatus(); },
    startNotifications() { return reminderScheduler?.start() ?? false; },
    checkNotifications() { reminderScheduler?.check(); },
    getNotificationStatus() { return reminderScheduler?.getStatus() ?? { mode: 'in-app', error: '' }; },
    shutdown() {
      clearInterval(lockCheck);
      try { reminderScheduler?.stop(); ipc.shutdown(); }
      finally { database.close(); }
    },
  };
}
