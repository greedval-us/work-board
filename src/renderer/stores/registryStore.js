import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { REGISTRY_REPORT_TYPE } from '../../shared/registry.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { registryService } from '../services/RegistryService.js';
import { useAppStore } from './appStore.js';
import { createRegistryList } from './registry/list.js';
import { createRegistryRecords } from './registry/records.js';

// The factory supplies boundary dependencies in tests; each Pinia owns one registry.
export function createRegistryStore({ app: suppliedApp, service = registryService, now = () => new Date(), closed = false } = {}) {
  return defineStore(closed ? 'closedRegistry' : 'registry', () => {
    const app = suppliedApp ?? useAppStore();
    const ready = computed(() => Boolean(app.database?.ready));
    const error = shallowRef('');
    const notice = shallowRef('');
    const unopenedExportPath = shallowRef(null);
    const exporting = shallowRef(false);
    let active = true;
    let refreshQueued = false;

    const isCurrent = generation => active && ready.value && generation === app.database.generation;

    function showNotice(message, filePath = null) {
      notice.value = message;
      unopenedExportPath.value = filePath;
    }

    const { query, invalidateList, resetList, ...list } = createRegistryList({ app, service, now, closed, ready, error });
    const records = createRegistryRecords({ app, service, closed, ready, isCurrent, error, showNotice });

    async function exportRecords(reportType = REGISTRY_REPORT_TYPE.FULL) {
      if (!active || !ready.value || exporting.value || app.databaseSwitching) return false;
      list.updateToday();
      const request = query();
      if (reportType !== REGISTRY_REPORT_TYPE.FULL) request.reportType = reportType;
      exporting.value = true;
      error.value = '';
      showNotice('');
      try {
        const result = await app.withOperation(() => service.export(request));
        if (!isCurrent(request.generation)) return false;
        if (result.cancelled) {
          showNotice('Выгрузка отменена.');
          return false;
        }
        showNotice(`Выгружено записей: ${result.count}.`, result.opened === false ? result.filePath ?? '' : null);
        return true;
      } catch (cause) {
        if (isCurrent(request.generation)) error.value = errorMessage(cause, 'Не удалось выгрузить реестр.');
        return false;
      } finally {
        exporting.value = false;
      }
    }

    function queueRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (active) list.refresh();
      });
    }

    watch([() => app.database?.generation, () => app.database?.ready, () => app.revision], ([generation, databaseReady], previous) => {
      invalidateList();
      records.cancelRecordRead();
      const initial = !previous?.length;
      if (initial || generation !== previous[0] || databaseReady !== previous[1]) {
        resetList();
        showNotice('');
        error.value = '';
        records.clearMutationError();
      }
      if (initial) list.refresh();
      else queueRefresh();
    }, { immediate: true, flush: 'sync' });
    onScopeDispose(() => { active = false; });

    return { ...list, ...records, ready, error, notice, unopenedExportPath, exporting, exportRecords };
  });
}

export const useRegistryStore = createRegistryStore();
export const useClosedRegistryStore = createRegistryStore({ closed: true });
