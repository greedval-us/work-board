<script setup>
import PageHeading from '../components/ui/PageHeading.vue';
import AppearanceSettings from '../components/settings/AppearanceSettings.vue';
import StorageSettings from '../components/settings/StorageSettings.vue';
import { useAppStore } from '../stores/appStore.js';

const store = useAppStore();
</script>

<template>
  <section class="page settings-page">
    <PageHeading title="Настройки" description="Оформление и данные приложения." />
    <StorageSettings />
    <AppearanceSettings :theme="store.theme" :disabled="!store.database?.ready || store.loading || store.saving || store.databaseSwitching" @change="store.setTheme" />
    <p v-if="store.saving" class="save-status" role="status">Сохранение…</p>
  </section>
</template>
