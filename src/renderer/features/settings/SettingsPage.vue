<script setup>
import { computed } from 'vue';
import PageHeading from '../../ui/PageHeading.vue';
import AppearanceSettings from './AppearanceSettings.vue';
import AppLockSettings from './AppLockSettings.vue';
import RegistryOptionsSettings from './RegistryOptionsSettings.vue';
import StorageSettings from './StorageSettings.vue';
import { useAppStore } from '../../app/appStore.js';
import './settings.css';

const store = useAppStore();
const databaseUnavailable = computed(() => !store.database?.ready || store.loading || store.databaseSwitching);
</script>

<template>
  <section class="page settings-page">
    <div class="settings-header">
      <PageHeading title="Настройки" />
      <p v-if="store.saving" class="save-status" role="status">Сохранение…</p>
    </div>
    <div class="settings-layout">
      <div class="settings-preferences">
        <StorageSettings />
        <AppLockSettings />
        <AppearanceSettings :theme="store.theme" :appearance-style="store.appearanceStyle"
          :typography="store.typography" :typography-error="store.typographyError" :disabled="databaseUnavailable" :saving="store.saving"
          @change="store.setTheme" @change-appearance-style="store.setAppearanceStyle" @change-typography="store.setTypography" />
      </div>
      <RegistryOptionsSettings :key="store.database?.generation" :options="store.registryOptions" :executor-contacts="store.executorContacts"
        :office="store.office" :office-error="store.officeError" :save-office="store.setOffice"
        :ready="Boolean(store.database?.ready)" :disabled="databaseUnavailable || store.saving" :error="store.registryOptionsError"
        :add-option="store.addRegistryOption" :update-option="store.updateRegistryOption" :remove-option="store.removeRegistryOption" />
    </div>
  </section>
</template>
