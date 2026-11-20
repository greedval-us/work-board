<script setup>
import { computed } from 'vue';
import PageHeading from '../../ui/PageHeading.vue';
import AppearanceSettings from './AppearanceSettings.vue';
import RegistryOptionsSettings from './RegistryOptionsSettings.vue';
import StorageSettings from './StorageSettings.vue';
import { useAppStore } from '../../app/appStore.js';
import './settings.css';

const store = useAppStore();
const disabled = computed(() => !store.database?.ready || store.loading || store.saving || store.databaseSwitching);
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
        <AppearanceSettings :theme="store.theme" :typography="store.typography" :typography-error="store.typographyError"
          :disabled="disabled" @change="store.setTheme" @change-typography="store.setTypography" />
      </div>
      <RegistryOptionsSettings :key="store.database?.generation" :options="store.registryOptions" :executor-contacts="store.executorContacts"
        :office="store.office" :office-error="store.officeError" :save-office="store.setOffice"
        :ready="Boolean(store.database?.ready)" :disabled="disabled" :error="store.registryOptionsError"
        :add-option="store.addRegistryOption" :update-option="store.updateRegistryOption" :remove-option="store.removeRegistryOption" />
    </div>
  </section>
</template>
