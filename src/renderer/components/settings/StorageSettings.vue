<script setup>
import { computed } from 'vue';
import { Database, FolderOpen, Plus } from 'lucide-vue-next';
import { useAppStore } from '../../stores/appStore.js';

const app = useAppStore();
const busy = computed(() => app.loading || app.databaseSwitching || app.pendingOperations > 0);
</script>

<template>
  <section class="settings-section" aria-labelledby="storage-title">
    <div class="section-heading">
      <h2 id="storage-title">Локальная база данных</h2>
      <p>Выберите, где хранить указания и задачи. Можно создать новый файл или открыть существующий.</p>
    </div>
    <div class="storage-actions">
      <button type="button" class="storage-button" :disabled="busy" @click="app.selectDatabase('create')">
        <Plus :size="16" aria-hidden="true" />{{ app.database?.ready ? 'Создать другую базу' : 'Создать базу' }}
      </button>
      <button type="button" class="storage-button" :disabled="busy" @click="app.selectDatabase('open')">
        <FolderOpen :size="16" aria-hidden="true" />Открыть базу
      </button>
    </div>
    <p v-if="app.databaseSwitching" class="storage-note" role="status">Выбор базы данных…</p>
    <dl class="details-list">
      <div><dt>Состояние</dt><dd role="status">{{ app.loading ? 'Подключение…' : app.database?.ready ? 'База подключена' : 'База не выбрана' }}</dd></div>
      <template v-if="app.database?.ready">
        <div><dt>Хранилище</dt><dd>{{ app.database.engine }} {{ app.database.sqliteVersion }}</dd></div>
        <div><dt>Расположение</dt><dd class="file-path">{{ app.database.filePath }}</dd></div>
      </template>
    </dl>
    <p v-if="app.database?.message" class="storage-note">{{ app.database.message }}</p>
    <p class="storage-note"><Database :size="14" aria-hidden="true" />Данные сохраняются только в выбранном файле. Открытие другой базы не переносит и не объединяет записи.</p>
  </section>
</template>

<style scoped>
.storage-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.storage-button { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); font-size: 12px; font-weight: 550; }
.storage-button:hover { background: var(--raised); }
.storage-note { display: flex; align-items: flex-start; gap: 7px; margin-top: 14px; color: var(--muted); font-size: 12px; max-width: 70ch; }
.storage-note svg { margin-top: 2px; }
</style>
