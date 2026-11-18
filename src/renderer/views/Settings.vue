<script setup>
import { computed } from 'vue';
import PageHeading from '../components/ui/PageHeading.vue';
import AppearanceSettings from '../components/settings/AppearanceSettings.vue';
import RegistryOptionsSettings from '../components/settings/RegistryOptionsSettings.vue';
import StorageSettings from '../components/settings/StorageSettings.vue';
import { useAppStore } from '../stores/appStore.js';

const store = useAppStore();
const disabled = computed(() => !store.database?.ready || store.loading || store.saving || store.databaseSwitching);
</script>

<template>
  <section class="page settings-page">
    <PageHeading title="Настройки" description="Оформление и данные приложения." />
    <StorageSettings />
    <RegistryOptionsSettings :key="store.database?.generation" :options="store.registryOptions" :executor-contacts="store.executorContacts"
      :office="store.office" :office-error="store.officeError" :save-office="store.setOffice"
      :ready="Boolean(store.database?.ready)" :disabled="disabled" :error="store.registryOptionsError"
      :add-option="store.addRegistryOption" :update-option="store.updateRegistryOption" :remove-option="store.removeRegistryOption" />
    <AppearanceSettings :theme="store.theme" :typography="store.typography" :typography-error="store.typographyError"
      :disabled="disabled" @change="store.setTheme" @change-typography="store.setTypography" />
    <p v-if="store.saving" class="save-status" role="status">Сохранение…</p>
  </section>
</template>
