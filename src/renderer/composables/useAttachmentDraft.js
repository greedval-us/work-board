import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { attachmentService } from '../services/AttachmentService.js';
import { useAppStore } from '../stores/appStore.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { appendAttachmentSelections, attachmentRows, toggleAttachmentRemoval } from '../domain/attachments.js';

export function useAttachmentDraft(props, changes, { app = useAppStore(), service = attachmentService } = {}) {
  const files = shallowRef([]); const loading = shallowRef(false); const busy = shallowRef(false);
  const error = shallowRef(''); const notice = shallowRef('');
  let version = 0; let disposed = false;
  const request = () => ({ entityType: props.entityType, entityId: props.entityId, generation: props.generation });
  let context = request();
  const selectedTokens = new Set(changes.value.add.map(file => file.token));
  const current = (source = context) => !disposed && source === context && app.database?.ready
    && app.database.generation === source.generation && props.generation === source.generation
    && props.entityType === source.entityType && props.entityId === source.entityId;
  const rows = computed(() => attachmentRows(files.value, changes.value));
  const visibleCount = computed(() => rows.value.filter(file => !file.removed).length);
  async function release(tokens, source) {
    // Old generations are cleared by main when the next selection starts.
    if (!service.release || !tokens.length || app.database?.generation !== source.generation) return;
    try { await service.release({ ...source, tokens }); }
    catch { /* Tokens hold no files; failed best-effort cleanup must not block the editor. */ }
  }
  function releaseSelected() {
    const tokens = [...selectedTokens];
    selectedTokens.clear();
    void release(tokens, context);
    return tokens;
  }
  async function load() {
    const ticket = ++version;
    const source = context;
    files.value = []; error.value = '';
    if (!source.entityId) { loading.value = false; return; }
    loading.value = true;
    try { const result = await service.list(source); if (current(source) && ticket === version) files.value = result; }
    catch (cause) { if (current(source) && ticket === version) error.value = errorMessage(cause, 'Не удалось загрузить вложения.'); }
    finally { if (ticket === version && !disposed) loading.value = false; }
  }
  async function perform(operation) {
    const source = context;
    if (busy.value || !current(source)) return;
    busy.value = true; error.value = ''; notice.value = '';
    try { await app.withOperation(() => operation(source)); }
    catch (cause) { if (current(source)) error.value = errorMessage(cause, 'Не удалось выполнить действие с файлом.'); }
    finally { if (!disposed) busy.value = false; }
  }
  function pick() {
    return perform(async source => {
      const result = await service.pick(source);
      if (result.cancelled) return;
      if (!current(source)) { await release(result.files.map(file => file.token), source); return; }
      for (const file of result.files) selectedTokens.add(file.token);
      changes.value = appendAttachmentSelections(changes.value, result.files);
    });
  }
  function download(file) {
    return perform(async source => {
      const result = await service.download({ ...source, id: file.id });
      if (current(source) && !result.cancelled) notice.value = `Файл «${file.name}» сохранён.`;
    });
  }
  function toggleRemove(file) {
    if (busy.value || !current()) return;
    if (file.token && selectedTokens.delete(file.token)) void release([file.token], context);
    changes.value = toggleAttachmentRemoval(changes.value, file);
  }
  watch(() => [props.entityType, props.entityId, props.generation], () => {
    const tokens = releaseSelected();
    if (tokens.length) changes.value = { ...changes.value, add: changes.value.add.filter(file => !tokens.includes(file.token)) };
    context = request();
    notice.value = '';
    void load();
  }, { flush: 'sync' });
  void load();
  onScopeDispose(() => { disposed = true; version++; releaseSelected(); });
  return { files, rows, visibleCount, loading, busy, error, notice, load, pick, download, toggleRemove };
}
