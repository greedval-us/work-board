import { storeToRefs } from 'pinia';
import { onScopeDispose, shallowRef, watch } from 'vue';
import { localDate } from '../../shared/registry.js';
import { createRegistryStore, useRegistryStore } from '../stores/registryStore.js';
import { useAppStore } from '../stores/appStore.js';

// Route-local card state only. Queries, results and operations belong to Pinia.
export function useRegistry(suppliedApp, service) {
  const app = suppliedApp ?? useAppStore();
  const store = suppliedApp || service ? createRegistryStore({ app, ...(service ? { service } : {}) })() : useRegistryStore();
  const refs = storeToRefs(store);
  const selected = shallowRef(null);
  let selectedGeneration = null;
  let recordVersion = 0;
  let active = true;
  const isCurrent = (generation) => active && app.database?.ready && app.database.generation === generation;

  function closeRecord() {
    ++recordVersion;
    selected.value = null;
    selectedGeneration = null;
    store.cancelRecordRead();
    store.clearMutationError();
  }

  function createRecord() {
    if (!store.canMutate) return false;
    closeRecord();
    selectedGeneration = app.database.generation;
    selected.value = { id: null, controlDate: localDate(), incomingNumber: '', instructionNumber: '',
      title: '', summary: '', deadline: '', executor: '', status: 'pending', executionMark: '' };
    return true;
  }

  async function openRecord(id) {
    const generation = app.database?.generation;
    const version = ++recordVersion;
    const record = await store.getRecord(id, generation);
    if (!record || !isCurrent(generation) || version !== recordVersion) return false;
    selectedGeneration = generation;
    selected.value = record;
    store.clearMutationError();
    return true;
  }

  async function saveRecord(data) {
    if (!selected.value || !isCurrent(selectedGeneration)) return false;
    const version = recordVersion;
    const saved = await store.saveRecord({ id: selected.value.id, data, generation: selectedGeneration });
    if (saved && active && version === recordVersion) closeRecord();
    return saved;
  }

  async function removeRecord() {
    if (!selected.value?.id || !isCurrent(selectedGeneration)) return false;
    const version = recordVersion;
    const removed = await store.removeRecord({ id: selected.value.id, generation: selectedGeneration });
    if (removed && active && version === recordVersion) closeRecord();
    return removed;
  }

  watch([() => app.database?.generation, () => app.database?.ready], closeRecord, { flush: 'sync' });
  store.ensureLoaded();
  onScopeDispose(() => { active = false; closeRecord(); });

  return { ...refs, draftFilters: store.draftFilters, formError: refs.mutationError, selected,
    refresh: store.refresh, applyFilters: store.applyFilters, resetFilters: store.resetFilters,
    changeSort: store.changeSort, setPage: store.setPage, setPageSize: store.setPageSize,
    exportRecords: store.exportRecords, closeRecord, createRecord, openRecord, saveRecord, removeRecord };
}
