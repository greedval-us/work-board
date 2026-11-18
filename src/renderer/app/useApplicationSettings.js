import { ref, shallowRef } from 'vue';
import { DEFAULT_SETTINGS } from '../../shared/constants/settings.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { settingsService } from './services/SettingsService.js';

export function useApplicationSettings({ database, canWrite, withOperation, error }) {
  const theme = ref(DEFAULT_SETTINGS.theme);
  const typography = shallowRef(DEFAULT_SETTINGS.typography);
  const registryOptions = shallowRef(DEFAULT_SETTINGS.registryOptions);
  const executorContacts = shallowRef(DEFAULT_SETTINGS.executorContacts);
  const office = ref(DEFAULT_SETTINGS.office);
  const registryOptionsError = ref('');
  const officeError = ref('');
  const typographyError = ref('');
  const saving = ref(false);

  function clearFeedback() {
    registryOptionsError.value = '';
    officeError.value = '';
    typographyError.value = '';
  }

  function applySettings(settings) {
    theme.value = settings.theme;
    typography.value = settings.typography ?? DEFAULT_SETTINGS.typography;
    registryOptions.value = settings.registryOptions ?? DEFAULT_SETTINGS.registryOptions;
    executorContacts.value = settings.executorContacts ?? DEFAULT_SETTINGS.executorContacts;
    office.value = settings.office ?? DEFAULT_SETTINGS.office;
    clearFeedback();
  }

  async function saveSettings(operation, feedback = error) {
    if (!canWrite() || !database.value?.ready || saving.value) return false;
    saving.value = true;
    error.value = '';
    clearFeedback();
    try {
      const settings = await withOperation(() => operation(database.value.generation));
      applySettings(settings);
      return true;
    } catch (cause) {
      feedback.value = errorMessage(cause, 'Не удалось сохранить настройки.');
      return false;
    } finally { saving.value = false; }
  }

  function setTheme(value) {
    return saveSettings(generation => settingsService.setTheme(value, generation));
  }

  function setTypography(value) {
    return saveSettings(generation => settingsService.setTypography(value, generation), typographyError);
  }

  function setOffice(value) {
    return saveSettings(generation => settingsService.setOffice(value, generation), officeError);
  }

  function addRegistryOption(field, value, contact) {
    return saveSettings(generation => settingsService.addRegistryOption(
      field, value, generation, ...(contact === undefined ? [] : [contact]),
    ), registryOptionsError);
  }

  function updateRegistryOption(field, previousValue, value, contact) {
    return saveSettings(generation => settingsService.updateRegistryOption(
      field, previousValue, value, generation, ...(contact === undefined ? [] : [contact]),
    ), registryOptionsError);
  }

  function removeRegistryOption(field, value) {
    return saveSettings(generation => settingsService.removeRegistryOption(field, value, generation), registryOptionsError);
  }

  return {
    theme, typography, registryOptions, executorContacts, office, saving, registryOptionsError, officeError, typographyError,
    applySettings, setTheme, setTypography, setOffice, addRegistryOption, updateRegistryOption, removeRegistryOption,
  };
}
