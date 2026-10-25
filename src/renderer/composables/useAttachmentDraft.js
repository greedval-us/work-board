import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { attachmentService } from '../services/AttachmentService.js';
import { useAppStore } from '../stores/appStore.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { appendAttachmentSelections, attachmentRows, toggleAttachmentRemoval } from '../domain/attachments.js';

export function useAttachmentDraft(props, changes, { app = useAppStore(), service = attachmentService } = {}) {
  const files = shallowRef([]); const loading = shallowRef(false); const busy = shallowRef(false);
  const error = shallowRef(''); const notice = shallowRef('');
  let version = 0; let disposed = false;
  const current = () => !disposed && app.database?.ready && app.database.generation === props.generation;
  const request = () => ({ entityType: props.entityType, entityId: props.entityId, generation: props.generation });
  const rows = computed(() => attachmentRows(files.value, changes.value));
  const visibleCount = computed(() => rows.value.filter(file => !file.removed).length);
  function release(selections) {
    if (service.release && selections.length && app.database?.generation === props.generation) {
      // Selection tokens hold no files; closing/discarding a form releases their memory.
      void service.release({ ...request(), tokens: selections.map(file => file.token) }).catch(() => {});
    }
  }
  async function load() {
    const ticket = ++version;
    files.value = []; error.value = '';
    if (!props.entityId) { loading.value = false; return; }
    loading.value = true;
    try { const result = await service.list(request()); if (current() && ticket === version) files.value = result; }
    catch (cause) { if (current() && ticket === version) error.value = errorMessage(cause, 'Не удалось загрузить вложения.'); }
    finally { if (ticket === version && !disposed) loading.value = false; }
  }
  async function perform(operation) {
    if (busy.value || !current()) return;
    busy.value = true; error.value = ''; notice.value = '';
    try { await app.withOperation(operation); }
    catch (cause) { if (current()) error.value = errorMessage(cause, 'Не удалось выполнить действие с файлом.'); }
    finally { if (!disposed) busy.value = false; }
  }
  function pick() {
    return perform(async () => {
      const result = await service.pick(request());
      if (current() && !result.cancelled) changes.value = appendAttachmentSelections(changes.value, result.files);
    });
  }
  function download(file) {
    return perform(async () => {
      const result = await service.download({ ...request(), id: file.id });
      if (current() && !result.cancelled) notice.value = `Файл «${file.name}» сохранён.`;
    });
  }
  function toggleRemove(file) {
    if (busy.value || !current()) return;
    if (file.token) release([file]);
    changes.value = toggleAttachmentRemoval(changes.value, file);
  }
  watch(() => [props.entityType, props.entityId, props.generation], load, { immediate: true });
  onScopeDispose(() => { release(changes.value.add); disposed = true; version++; });
  return { files, rows, visibleCount, loading, busy, error, notice, load, pick, download, toggleRemove };
}
