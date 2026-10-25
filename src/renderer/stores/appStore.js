import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_SETTINGS } from '../../shared/constants/settings.js';
import { appService } from '../services/AppService.js';
import { settingsService } from '../services/SettingsService.js';
import { databaseService } from '../services/DatabaseService.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { DesktopError, ERROR_CODES } from '../../shared/errors.js';
import { createSingleFlight } from '../infrastructure/requestScope.js';

export const useAppStore = defineStore('app', () => {
  const info = ref(null);
  const database = ref(null);
  const theme = ref(DEFAULT_SETTINGS.theme);
  const loading = ref(false);
  const initialized = ref(false);
  const saving = ref(false);
  const error = ref('');
  const revision = ref(0);
  const pendingOperations = ref(0);
  const databaseSwitching = ref(false);
  const unsavedGuards = new Set();
  const initialization = createSingleFlight();

  function initialize() {
    return initialization.run('bootstrap', loadApplication);
  }

  async function loadApplication() {
    loading.value = true;
    error.value = '';
    try {
      const [appInfo, status] = await Promise.all([appService.getInfo(), appService.getDatabaseStatus()]);
      const settings = status.ready ? await settingsService.get(status.generation) : DEFAULT_SETTINGS;
      info.value = appInfo;
      database.value = status;
      theme.value = settings.theme;
      initialized.value = true;
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось загрузить локальные данные.');
    } finally { loading.value = false; }
  }

  async function setTheme(value) {
    if (!initialized.value || !database.value?.ready || loading.value || saving.value || databaseSwitching.value) return;
    saving.value = true;
    error.value = '';
    try {
      const settings = await withOperation(() => settingsService.setTheme(value, database.value.generation));
      theme.value = settings.theme;
    } catch (cause) {
      error.value = errorMessage(cause, 'Не удалось сохранить настройки.');
    } finally { saving.value = false; }
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

  async function prepareToClose() {
    if (pendingOperations.value > 0 || databaseSwitching.value) {
      error.value = 'Дождитесь завершения текущей операции перед закрытием приложения.';
      return false;
    }
    return resolveUnsavedChanges();
  }

  async function selectDatabase(mode) {
    if (pendingOperations.value > 0 || databaseSwitching.value || loading.value) {
      error.value = 'Дождитесь завершения текущей операции перед выбором базы.';
      return false;
    }
    if (!['create', 'open'].includes(mode)) return false;
    if (!await resolveUnsavedChanges()) return false;
    databaseSwitching.value = true;
    error.value = '';
    try {
      const result = await databaseService[mode]();
      if (result.cancelled) return false;
      database.value = result.status;
      theme.value = DEFAULT_SETTINGS.theme;
      try { theme.value = (await settingsService.get(result.status.generation)).theme; }
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
    info, database, theme, loading, initialized, saving, error, revision, pendingOperations,
    databaseSwitching, initialize, setTheme, touchData, withOperation, selectDatabase,
    registerUnsavedGuard, resolveUnsavedChanges, prepareToClose,
    hasUnsavedGuards: () => unsavedGuards.size > 0,
  };
});
