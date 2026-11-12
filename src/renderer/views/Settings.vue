<script setup>
import { computed } from 'vue';
import PageHeading from '../components/ui/PageHeading.vue';
import AppearanceSettings from '../components/settings/AppearanceSettings.vue';
import ExecutorContactsSettings from '../components/settings/ExecutorContactsSettings.vue';
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
      :ready="Boolean(store.database?.ready)" :disabled="disabled" :error="store.registryOptionsError" :add-option="store.addRegistryOption"
      :update-option="store.updateRegistryOption" :remove-option="store.removeRegistryOption" />
    <ExecutorContactsSettings v-if="store.database?.ready" :key="`contacts-${store.database.generation}`"
      :options="store.registryOptions" :contacts="store.executorContacts" :disabled="disabled"
      :error="store.executorContactsError" :save-contact="store.setExecutorContact" />
    <AppearanceSettings :theme="store.theme" :disabled="disabled" @change="store.setTheme" />
    <p v-if="store.saving" class="save-status" role="status">Сохранение…</p>
  </section>
</template>
