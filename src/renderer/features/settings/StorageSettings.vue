<script setup>
import { computed } from 'vue';
import { ChevronRight, Database } from 'lucide-vue-next';
import ActionIcon from '../../ui/ActionIcon.vue';
import { useAppStore } from '../../app/appStore.js';

const app = useAppStore();
const busy = computed(() => app.loading || app.databaseSwitching || app.pendingOperations > 0);
const fileName = computed(() => app.database?.filePath?.split(/[\\/]/).pop());
</script>

<template>
  <section class="settings-section" aria-labelledby="storage-title">
    <div class="section-heading">
      <span class="settings-glyph"><Database :size="17" aria-hidden="true" /></span>
      <h2 id="storage-title">Локальная база данных</h2>
    </div>
    <dl class="details-list">
      <div><dt>Состояние</dt><dd class="storage-state" :class="{ 'storage-ready': app.database?.ready }" role="status"><span>{{ app.loading ? 'Подключение…' : app.database?.ready ? 'Подключена' : 'Не выбрана' }}</span></dd></div>
      <template v-if="app.database?.ready">
        <div class="storage-file">
          <dt>Файл</dt>
          <dd>
            <details :key="app.database.filePath">
              <summary :title="app.database.filePath">
                <span>{{ fileName }}</span><ChevronRight :size="13" aria-hidden="true" />
              </summary>
              <span class="file-path">{{ app.database.filePath }}</span>
              <span class="storage-engine">{{ app.database.engine }} {{ app.database.sqliteVersion }}</span>
            </details>
          </dd>
        </div>
      </template>
    </dl>
    <div class="storage-actions">
      <button type="button" class="storage-button" :disabled="busy" @click="app.selectDatabase('create')">
        <ActionIcon name="create" :size="16" /><span>Создать<span class="sr-only">{{ app.database?.ready ? ' другую базу' : ' базу' }}</span></span>
      </button>
      <button type="button" class="storage-button" :disabled="busy" @click="app.selectDatabase('open')">
        <ActionIcon name="open" :size="16" /><span>Открыть<span class="sr-only"> базу</span></span>
      </button>
    </div>
    <p v-if="app.databaseSwitching" class="storage-note" role="status">Выбор базы данных…</p>
    <p v-if="app.database?.message" class="storage-note">{{ app.database.message }}</p>
    <p v-if="!app.database?.ready" class="storage-note">Указания и задачи хранятся в выбранном файле. У каждой базы свои записи.</p>
  </section>
</template>

<style scoped>
.storage-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.storage-button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 9px; border: 1px solid var(--border); border-radius: 8px; background: var(--grouped); font-size: calc(12px + var(--app-font-offset)); font-weight: 550; }
.storage-button:enabled:hover { background: var(--raised); }
.storage-state { display: inline-flex; justify-self: end; align-items: center; gap: 5px; }
.storage-state::before { content: ''; flex: 0 0 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.storage-state.storage-ready::before { background: #279563; }
.details-list > .storage-file { display: block; }
.storage-file dt { float: left; margin-right: 8px; }
.storage-file summary { display: flex; align-items: center; justify-content: flex-end; gap: 3px; color: var(--accent); cursor: pointer; list-style: none; }
.storage-file summary::-webkit-details-marker { display: none; }
.storage-file summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.storage-file summary svg { transition: transform var(--motion-fast) var(--motion-ease-out); }
.storage-file details[open] svg { transform: rotate(90deg); }
.storage-file .file-path { display: block; clear: both; padding-top: 6px; text-align: left; }
.storage-engine { display: block; margin-top: 3px; color: var(--muted); text-align: left; }
.storage-note { margin-top: 9px; color: var(--muted); font-size: calc(11px + var(--app-font-offset)); line-height: 1.45; }
</style>
