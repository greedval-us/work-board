<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRoute } from 'vue-router';
import { Archive, CalendarDays, Columns3, RefreshCw, SearchX, Table2 } from 'lucide-vue-next';
import ActionIcon from '../../ui/ActionIcon.vue';
import registryFolder from '../../assets/registry-folder.webp';
import { normalizeSearch, REGISTRY_REPORT_LABELS } from '../../../shared/registry.js';
import { useAppStore } from '../../app/appStore.js';
import PageHeading from '../../ui/PageHeading.vue';
import ConfirmDialog from '../../ui/ConfirmDialog.vue';
import ExportOpenWarning from '../../ui/ExportOpenWarning.vue';
import ControlFilters from './components/ControlFilters.vue';
import ControlPagination from './components/ControlPagination.vue';
import ControlTable from './components/ControlTable.vue';
import './control.css';

const ControlYearCalendar = defineAsyncComponent(() => import('./year/ControlYearCalendar.vue'));
const props = defineProps({
  sectionTitle: { type: String, required: true }, closed: Boolean, yearCalendar: { type: Object, required: true },
  useWorkspace: { type: Function, required: true }, recordDialog: { type: Object, required: true },
  columns: { type: Array, required: true }, labels: { type: Object, required: true }, groupRows: Function,
});
const app = useAppStore();
const choosingDatabase = computed(() => app.loading || app.databaseSwitching || app.pendingOperations > 0);
const route = useRoute();
const editor = useTemplateRef('editor');
const confirmation = useTemplateRef('confirmation');
const exportButton = useTemplateRef('exportButton');
const resultsHeading = useTemplateRef('resultsHeading');
const wideColumns = shallowRef(false);
const { draftFilters, appliedFilters, sort, page, pageSize, pageCount, items, documentTypes, total, loading, saving, deleting, closingControl,
  exporting, opening, error, filterError, formError, notice, unopenedExportPath, selected, selectedCheckpoint, ready, canMutate, today,
  hasAppliedFilters, filtersChanged, refresh, applyFilters, resetFilters, changeSort, updateToday,
  setPage, setPageSize, closeRecord, createRecord, openRecord, saveRecord, removeRecord, closeControl,
  closeSelectedControl, exportRecords } = props.useWorkspace();
const filterDocumentTypes = computed(() => {
  const labels = [...documentTypes.value, ...app.registryOptions.documentType, draftFilters.documentType];
  const distinct = new Map(labels.filter(Boolean).map(label => [normalizeSearch(label), label]));
  return [...distinct.values()].sort((left, right) => left.localeCompare(right, 'ru'));
});
const displayedRecord = shallowRef(null);
const displayedGeneration = shallowRef(null);
const displayedKey = shallowRef(0);
let midnightTimer;
let surfaceVersion = 0;
let disposed = false;
let focusResultsAfterClosure = false;

watch([selected, () => app.database?.generation], async ([record, generation]) => {
  const version = ++surfaceVersion;
  if (record) {
    const reuseSurface = displayedRecord.value === record && displayedGeneration.value === generation;
    displayedRecord.value = record;
    displayedGeneration.value = generation;
    if (!reuseSurface) displayedKey.value++;
    else {
      await nextTick();
      if (!disposed && version === surfaceVersion) editor.value?.enterSurface();
    }
    return;
  }
  await editor.value?.leaveSurface();
  if (!disposed && version === surfaceVersion && !selected.value) {
    displayedRecord.value = null;
    displayedGeneration.value = null;
    if (focusResultsAfterClosure) {
      focusResultsAfterClosure = false;
      await nextTick();
      if (!disposed && version === surfaceVersion) resultsHeading.value?.focus();
    }
  }
}, { immediate: true });

async function confirmCloseControl(record) {
  const path = route.fullPath;
  const choice = await confirmation.value.ask({ title: 'Закрыть контроль?',
    message: props.labels.confirmClose(record),
    primaryLabel: 'Закрыть контроль' });
  return choice === 'primary' && !disposed && route.fullPath === path;
}

async function closeControlFromList(record) {
  if (!canMutate.value || loading.value || opening.value || record.closedAt) return;
  const generation = app.database?.generation;
  if (await confirmCloseControl(record) && await closeControl({ id: record.id, generation })) resultsHeading.value?.focus();
}

async function closeControlFromCard() {
  const record = selected.value;
  if (!record || !await confirmCloseControl(record) || selected.value !== record) return;
  focusResultsAfterClosure = true;
  if (!await closeSelectedControl()) focusResultsAfterClosure = false;
}

async function chooseExportFormat() {
  if (!ready.value || exporting.value || app.databaseSwitching) return;
  const generation = app.database?.generation;
  const path = route.fullPath;
  const isCurrent = () => !disposed && route.fullPath === path && app.database?.generation === generation;
  const choice = await confirmation.value.ask({ title: 'Формат отчёта Excel',
    message: `${props.labels.exportHelp} Для отчёта «Просроченные контроли» проверяются все открытые записи раздела.`,
    choices: REGISTRY_REPORT_LABELS });
  if (choice === 'cancel' || !isCurrent()) return;
  await exportRecords(choice);
  await nextTick();
  if (isCurrent() && document.activeElement === document.body) exportButton.value?.focus({ preventScroll: true });
}

function updateDate() {
  updateToday();
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(updateDate, next.getTime() - now.getTime() + 100);
}

function guardDraft() {
  if (editor.value) return editor.value.requestClose();
  // Navigation can leave the selected card while its editor is still loading.
  if (selected.value) closeRecord();
  return true;
}
const unregisterGuard = app.registerUnsavedGuard(guardDraft);
onBeforeRouteLeave(guardDraft);
defineExpose({ requestClose: guardDraft });

onMounted(() => { updateDate(); window.addEventListener('focus', updateDate); document.addEventListener('visibilitychange', updateDate); });
onBeforeUnmount(() => { disposed = true; surfaceVersion++; unregisterGuard(); clearTimeout(midnightTimer); window.removeEventListener('focus', updateDate); document.removeEventListener('visibilitychange', updateDate); });
</script>

<template>
  <section class="page registry-page">
    <div class="registry-workspace">
      <div class="registry-toolbar">
        <PageHeading :title="sectionTitle" />
        <div v-if="ready" class="registry-actions">
          <button ref="exportButton" class="registry-button" type="button" aria-haspopup="dialog" :disabled="exporting || app.databaseSwitching" @click="chooseExportFormat"><ActionIcon name="export" :size="15" />{{ exporting ? 'Выгрузка…' : 'Выгрузить Excel' }}</button>
          <button v-if="!props.closed" class="registry-button registry-button-primary" type="button" :disabled="!canMutate" @click="createRecord"><ActionIcon name="create" :size="16" />{{ labels.add }}</button>
        </div>
      </div>
      <div v-if="ready" class="control-views">
        <slot name="views" />
        <div class="control-scope-switch" role="group" aria-label="Представление контроля">
          <button type="button" class="registry-inline-action" :aria-pressed="!yearCalendar.visible" @click="yearCalendar.show(false)"><Table2 :size="15" aria-hidden="true" />Таблица</button>
          <button type="button" class="registry-inline-action" :aria-pressed="yearCalendar.visible" @click="yearCalendar.show(true)"><CalendarDays :size="15" aria-hidden="true" />Годовой календарь</button>
        </div>
      </div>
      <div v-if="!ready" class="registry-no-database">
        <section class="registry-setup" aria-labelledby="registry-setup-title">
          <div class="registry-setup-visual">
            <img class="registry-setup-art" :src="registryFolder" alt="" draggable="false" />
          </div>
          <div class="registry-setup-content">
            <h2 id="registry-setup-title">Выберите базу данных</h2>
            <p>{{ app.database?.message || 'Создайте базу данных или откройте существующий файл.' }}</p>
            <RouterLink v-if="app.database?.message" class="registry-setup-link" to="/settings">Настройки хранилища</RouterLink>
          </div>
          <div class="registry-setup-footer">
            <p v-if="app.databaseSwitching" class="registry-setup-note" role="status">Выбор базы данных…</p>
            <div class="registry-actions">
              <button class="registry-button registry-button-primary" type="button" :disabled="choosingDatabase" @click="app.selectDatabase('create')">
                <ActionIcon name="create" :size="16" />Создать базу
              </button>
              <button class="registry-button" type="button" :disabled="choosingDatabase" @click="app.selectDatabase('open')">
                <ActionIcon name="open" :size="16" />Открыть базу
              </button>
            </div>
          </div>
        </section>
      </div>
      <template v-else>
        <section class="registry-results" :aria-label="sectionTitle">
          <div v-if="!yearCalendar.visible" class="registry-results-heading">
            <h2 ref="resultsHeading" tabindex="-1">{{ hasAppliedFilters ? labels.found : labels.count }} <span class="registry-count">{{ total }}</span></h2>
            <ControlFilters :all-label="labels.all" :filters="draftFilters" :applied-filters="appliedFilters" :document-types="filterDocumentTypes" :closed="props.closed" :disabled="app.databaseSwitching" :changed="filtersChanged" :error="filterError" @update="({ field, value }) => draftFilters[field] = value" @apply="applyFilters" @reset="resetFilters" />
            <button v-if="items.length" type="button" class="registry-inline-action registry-column-toggle" :aria-pressed="wideColumns" :aria-label="wideColumns ? 'Уместить столбцы в ширину окна' : 'Показать все столбцы в полной ширине'" :title="wideColumns ? 'Уместить столбцы в ширину окна' : 'Показать все столбцы в полной ширине'" @click="wideColumns = !wideColumns"><Columns3 :size="15" aria-hidden="true" /><span>{{ wideColumns ? 'По ширине окна' : 'Все столбцы' }}</span></button>
          </div>
          <div v-if="error || notice && unopenedExportPath === null || !yearCalendar.visible && loading || opening" class="registry-status-slot"><div v-if="error" class="registry-error-banner" role="alert"><span :title="error">{{ error }}</span><button type="button" class="registry-inline-action" :disabled="loading" @click="refresh"><RefreshCw :size="12" aria-hidden="true" />Повторить</button></div><p v-else-if="notice && unopenedExportPath === null" class="registry-notice" role="status">{{ notice }}</p><span v-else class="registry-help" role="status">{{ loading ? 'Загрузка…' : 'Открытие карточки…' }}</span></div>
          <ExportOpenWarning v-if="unopenedExportPath !== null" :message="`${notice} Файл сохранён.`" :file-path="unopenedExportPath" />
          <ControlYearCalendar v-if="yearCalendar.visible" :year="yearCalendar.year" :events="yearCalendar.events" :today="today"
            :planning="yearCalendar.planning" :closed="props.closed" :loading="yearCalendar.loading" :error="yearCalendar.error"
            @change-year="yearCalendar.selectYear" @retry="yearCalendar.retry" @open-record="openRecord" />
          <ControlTable v-else-if="items.length" :columns="columns" :group-rows="groupRows" :items="items" :sort="sort" :loading="loading" :wide="wideColumns" :today="today"
            :closed="props.closed" :section-title="sectionTitle" :can-close-control="canMutate && !loading && !opening"
            @sort="changeSort" @open="openRecord" @close-control="closeControlFromList">
            <template #after-title="row"><slot name="after-title" v-bind="row" /></template>
          </ControlTable>
          <div v-else-if="loading" class="registry-empty registry-empty-results" role="status"><RefreshCw :size="28" class="registry-loading-icon" aria-hidden="true" /><h2>Загрузка…</h2></div>
          <div v-else class="registry-empty registry-empty-results">
            <span v-if="error || hasAppliedFilters || props.closed" class="registry-empty-symbol"><component :is="error ? RefreshCw : hasAppliedFilters ? SearchX : Archive" :size="26" :stroke-width="1.6" aria-hidden="true" /></span>
            <img v-else-if="app.appearanceStyle === 'standard'" class="registry-empty-art" :src="registryFolder" alt="" draggable="false" />
            <span v-else class="registry-empty-art registry-theme-art" aria-hidden="true" />
            <h2>{{ error ? labels.unavailable : hasAppliedFilters ? labels.noResults : props.closed ? labels.emptyClosed : labels.empty }}</h2>
            <p>{{ error ? 'Повторите загрузку списка.' : hasAppliedFilters ? 'Измените условия фильтров или сбросьте их.' : props.closed ? labels.closedHelp : labels.emptyHelp }}</p>
            <button v-if="error" type="button" class="registry-button" @click="refresh">Повторить загрузку</button>
            <button v-else-if="hasAppliedFilters" type="button" class="registry-button" @click="resetFilters">Сбросить фильтры</button>
            <button v-else-if="!props.closed" type="button" class="registry-button registry-button-primary" :disabled="!canMutate" @click="createRecord">{{ labels.add }}</button>
          </div>
          <ControlPagination v-if="total && !yearCalendar.visible" :unit="labels.pageUnit" :page="page" :page-size="pageSize" :page-count="pageCount" :total="total" :disabled="loading || app.databaseSwitching" @page="setPage" @page-size="setPageSize" />
        </section>
      </template>
      <component :is="recordDialog" v-if="displayedRecord" :key="displayedKey" ref="editor" :record="displayedRecord" :selected-checkpoint="selectedCheckpoint"
        :saving="saving" :deleting="deleting" :closing-control="closingControl" :error="formError" :closing="!selected"
        :can-edit="Boolean(selected) && displayedGeneration === app.database?.generation && ready && !app.databaseSwitching"
        :save-record="saveRecord" :delete-record="removeRecord" :close-control="props.closed ? null : closeControlFromCard" @close="closeRecord" />
      <ConfirmDialog ref="confirmation" />
    </div>
  </section>
</template>
