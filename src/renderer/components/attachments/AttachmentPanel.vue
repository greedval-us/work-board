<script setup>
import { useId, watch } from 'vue';
import { Paperclip, Download, X, Undo2, FileText } from 'lucide-vue-next';
import { useAttachmentDraft } from '../../composables/useAttachmentDraft.js';
import { formatFileSize } from '../../presentation/formatters.js';

const props = defineProps({ entityType: { type: String, required: true }, entityId: { default: null }, generation: { required: true }, disabled: Boolean });
const changes = defineModel({ type: Object, required: true });
const emit = defineEmits(['busy']);
const titleId = useId();
const { rows, visibleCount, loading, busy, error, notice, load, pick, download, toggleRemove } = useAttachmentDraft(props, changes);
watch(busy, value => emit('busy', value));
</script>

<template>
  <section class="attachment-panel" :aria-labelledby="titleId" :aria-busy="busy || loading">
    <header class="attachment-heading"><h3 :id="titleId"><Paperclip :size="15" aria-hidden="true" />Файлы <span>{{ visibleCount }}</span></h3><button type="button" class="attachment-add" :disabled="disabled || busy || loading" @click="pick"><Paperclip :size="14" aria-hidden="true" />{{ busy ? 'Подождите…' : 'Прикрепить' }}</button></header>
    <p v-if="loading" class="attachment-help" role="status">Загрузка файлов…</p>
    <p v-else-if="!rows.length" class="attachment-help">Прикрепите документы, изображения или другие файлы.</p>
    <ul v-if="rows.length" class="attachment-list">
      <li v-for="file in rows" :key="file.id ?? file.token" :class="{ 'attachment-removed': file.removed }">
        <FileText :size="17" class="attachment-file-icon" aria-hidden="true" />
        <div class="attachment-file"><button v-if="file.id && !file.removed" type="button" class="attachment-name" :title="`Скачать ${file.name}`" :disabled="disabled || busy" @click="download(file)">{{ file.name }}</button><span v-else class="attachment-name">{{ file.name }}</span><small>{{ formatFileSize(file.size) }}<span v-if="file.token"> · После сохранения</span><span v-if="file.removed"> · Будет удалён</span></small></div>
        <button v-if="file.id && !file.removed" type="button" class="attachment-icon-button" :aria-label="`Скачать ${file.name}`" :title="`Скачать ${file.name}`" :disabled="disabled || busy" @click="download(file)"><Download :size="16" aria-hidden="true" /></button>
        <button type="button" class="attachment-icon-button" :aria-label="`${file.removed ? 'Вернуть' : 'Убрать'} ${file.name}`" :title="file.removed ? 'Отменить удаление' : 'Убрать вложение'" :disabled="disabled || busy" @click="toggleRemove(file)"><Undo2 v-if="file.removed" :size="16" aria-hidden="true" /><X v-else :size="16" aria-hidden="true" /></button>
      </li>
    </ul>
    <p v-if="rows.length" class="attachment-help">Изменения файлов применяются при сохранении карточки.</p>
    <p v-if="notice" class="attachment-help" role="status">{{ notice }}</p>
    <div v-if="error" class="attachment-error" role="alert">{{ error }} <button v-if="!busy" type="button" class="attachment-retry" :disabled="disabled" @click="load">Обновить список</button></div>
  </section>
</template>

<style scoped>
.attachment-panel { min-width: 0; margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border); }
.attachment-heading, .attachment-heading h3 { display: flex; align-items: center; gap: 7px; }
.attachment-heading { justify-content: space-between; margin-bottom: 10px; }
.attachment-heading h3 { margin: 0; font-size: 13px; font-weight: 600; }
.attachment-heading h3 > span { color: var(--muted); font-size: 11px; font-weight: 400; }
.attachment-add { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 9px; color: var(--text); background: var(--panel); font: inherit; font-size: 12px; }
.attachment-add:hover, .attachment-icon-button:hover { background: var(--raised); }
.attachment-help { margin-top: 7px; color: var(--muted); font-size: 11px; }
.attachment-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.attachment-list > li { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px 9px; border: 1px solid var(--border); border-radius: 10px; background: var(--grouped); }
.attachment-file-icon { color: var(--muted); }
.attachment-file { flex: 1; min-width: 0; }
.attachment-name { display: block; max-width: 100%; padding: 0; overflow: hidden; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 12px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
button.attachment-name:hover { color: var(--accent); text-decoration: underline; }
.attachment-file small { display: block; color: var(--muted); font-size: 10px; }
.attachment-removed .attachment-name { color: var(--muted); text-decoration: line-through; }
.attachment-icon-button { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; color: var(--muted); background: transparent; }
.attachment-error { margin-top: 10px; padding: 9px; border-radius: 9px; color: var(--error); background: var(--error-surface); font-size: 12px; }
.attachment-retry { border: 0; color: inherit; background: transparent; font: inherit; text-decoration: underline; }
</style>
