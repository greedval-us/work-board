import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { REGISTRY_REPORT_TYPE } from '../../../../shared/registry.js';
import { errorMessage } from '../../../infrastructure/errorMessage.js';
import { useAppStore } from '../../../app/appStore.js';
import { createControlList } from './list.js';
import { createControlRecords } from './records.js';

export function createControlStore({ storeId, app: suppliedApp, service, now = () => new Date(), closed = false, enabled = () => true, columns, persist, messages }) {
  return defineStore(storeId, () => {
    const app = suppliedApp ?? useAppStore();
    const ready = computed(() => Boolean(app.database?.ready && enabled(app)));
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

    const { query, invalidateList, resetList, ...list } = createControlList({ app, service, now, closed, ready, error, columns, messages });
    const records = createControlRecords({ app, service, closed, ready, isCurrent, error, showNotice, persist, messages });

    async function exportRecords(reportType = REGISTRY_REPORT_TYPE.FULL) {
      if (!active || !ready.value || exporting.value || app.databaseSwitching) return false;
      list.updateToday();
      const request = reportType === REGISTRY_REPORT_TYPE.OVERDUE ? { generation: app.database.generation } : query();
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
        if (isCurrent(request.generation)) error.value = errorMessage(cause, 'Не удалось выгрузить отчёт.');
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

    watch([() => app.database?.generation, ready, () => app.revision], ([generation, databaseReady], previous) => {
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
