<script setup>
import AppIcon from '../ui/AppIcon.vue';
import PageHeading from '../ui/PageHeading.vue';
import { useAppStore } from './appStore.js';

const store = useAppStore();
</script>

<template>
  <section class="page about-page">
    <PageHeading title="О приложении" />
    <div class="about-panel">
      <div class="about-identity">
        <AppIcon :size="58" />
        <div>
          <h2>Work Board</h2>
          <p class="about-version">{{ store.info ? `Версия ${store.info.version}` : 'Загрузка сведений…' }}</p>
        </div>
      </div>
      <p class="about-summary">Реестр указаний, задачи и календарь. Данные хранятся на вашем компьютере и доступны без подключения к сети.</p>
    </div>
  </section>
</template>

<style scoped>
.about-page { display: flex; flex-direction: column; }
.about-panel {
  width: min(100%, 390px);
  margin: auto;
  padding: 22px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  box-shadow: var(--surface-shadow);
}
.about-identity { display: flex; align-items: center; gap: 12px; }
.about-panel h2 { font-size: calc(23px + var(--app-font-offset)); font-weight: 650; line-height: 1.25; letter-spacing: -.04em; }
.about-version { margin-top: 3px; color: var(--muted); font-size: calc(12px + var(--app-font-offset)); font-variant-numeric: tabular-nums; }
.about-summary { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: calc(13px + var(--app-font-offset)); line-height: 1.5; }
</style>
