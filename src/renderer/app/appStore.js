import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_SETTINGS } from '../../shared/constants/settings.js';
import { appService } from './services/AppService.js';
import { useApplicationSettings } from './useApplicationSettings.js';
import { settingsService } from './services/SettingsService.js';
import { databaseService } from './services/DatabaseService.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { DesktopError, ERROR_CODES } from '../../shared/errors.js';
import { createSingleFlight } from '../infrastructure/requestScope.js';

export const useAppStore = defineStore('app', () => {
  const info = ref(null);
  const database = ref(null);
  const loading = ref(false);
  const initialized = ref(false);
  const error = ref('');
  const revision = ref(0);
  const pendingOperations = ref(0);
  const databaseSwitching = ref(false);
  const unsavedGuards = new Set();
  const initialization = createSingleFlight();
  const { applySettings, ...settings } = useApplicationSettings({
    database, withOperation, error,
    canWrite: () => initialized.value && !loading.value && !databaseSwitching.value,
  });

  function initialize() {
    return initialization.run('bootstrap', loadApplication);
  }

  async function loadApplication() {
    if (databaseSwitching.value || settings.saving.value) return;
    loading.value = true;
    error.value = '';
    try {
      const [appInfo, status] = await Promise.all([appService.getInfo(), appService.getDatabaseStatus()]);
      const savedSettings = status.ready ? await settingsService.get(status.generation) : DEFAULT_SETTINGS;
      info.value = appInfo;
      database.value = status;
      applySettings(savedSettings);
      initialized.value = true;
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось загрузить локальные данные.');
    } finally { loading.value = false; }
  }

  function touchData() { revision.value++; }

  async function withOperation(operation) {
    if (databaseSwitching.value) throw new DesktopError(ERROR_CODES.APPLICATION, 'Дождитесь завершения выбора базы данных.');
    pendingOperations.value++;
    try { return await operation(); }
    finally { pendingOperations.value--; }
  }

  function registerUnsavedGuard(guard) {
    unsavedGuards.add(guard);
    return () => unsavedGuards.delete(guard);
  }

  async function resolveUnsavedChanges() {
    for (const guard of [...unsavedGuards]) if (await guard() === false) return false;
    return true;
  }

  function canClose() {
    if (pendingOperations.value > 0 || databaseSwitching.value) {
      error.value = 'Дождитесь завершения текущей операции перед закрытием приложения.';
      return false;
    }
    return true;
  }

  async function prepareToClose() {
    return canClose() && await resolveUnsavedChanges() && canClose();
  }

  function canSelectDatabase() {
    if (!pendingOperations.value && !databaseSwitching.value && !loading.value) return true;
    error.value = 'Дождитесь завершения текущей операции перед выбором базы.';
    return false;
  }

  async function selectDatabase(mode) {
    if (!canSelectDatabase()) return false;
    if (!['create', 'open'].includes(mode)) return false;
    if (!await resolveUnsavedChanges()) return false;
    if (!canSelectDatabase()) return false;
    databaseSwitching.value = true;
    error.value = '';
    try {
      const result = await databaseService[mode]();
      if (result.cancelled) return false;
      database.value = result.status;
      applySettings(DEFAULT_SETTINGS);
      try { applySettings(await settingsService.get(result.status.generation)); }
      catch (cause) { error.value = errorMessage(cause); }
      initialized.value = true;
      touchData();
      return true;
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось выбрать базу данных.');
      return false;
    } finally { databaseSwitching.value = false; }
  }

  return {
    ...settings, info, database, loading, initialized, error, revision, pendingOperations, databaseSwitching, initialize,
    touchData, withOperation, selectDatabase,
    registerUnsavedGuard, resolveUnsavedChanges, prepareToClose,
    hasUnsavedGuards: () => unsavedGuards.size > 0,
  };
});
