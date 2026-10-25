<script setup>
import AppIcon from '../components/ui/AppIcon.vue';
import PageHeading from '../components/ui/PageHeading.vue';
import { useAppStore } from '../stores/appStore.js';

const store = useAppStore();
</script>

<template>
  <section class="page settings-page">
    <PageHeading title="О приложении" />
    <div class="about-card">
      <div class="about-header">
        <AppIcon :size="72" />
        <div><h2>Work Board</h2><p class="muted">{{ store.info ? `Версия ${store.info.version}` : 'Загрузка сведений…' }}</p></div>
      </div>
      <p class="about-description">Личное рабочее пространство на вашем компьютере.
        Все данные сохраняются локально. Подключение к серверу не требуется.</p>
    </div>
  </section>
</template>
