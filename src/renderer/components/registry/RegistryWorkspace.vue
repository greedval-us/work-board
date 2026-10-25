<script setup>
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, RouterLink, useRoute } from 'vue-router';
import { Columns3, Download, FilePlus2, ListChecks, RefreshCw } from 'lucide-vue-next';
import { localDate } from '../../../shared/registry.js';
import { useRegistry } from '../../composables/useRegistry.js';
import { useAppStore } from '../../stores/appStore.js';
import PageHeading from '../ui/PageHeading.vue';
import InstructionDialog from './InstructionDialog.vue';
import RegistryFilters from './RegistryFilters.vue';
import RegistryPagination from './RegistryPagination.vue';
import RegistryTable from './RegistryTable.vue';

const app = useAppStore();
const route = useRoute();
const editor = useTemplateRef('editor');
const today = shallowRef(localDate());
const wideColumns = shallowRef(false);
const { draftFilters, appliedFilters, sort, page, pageSize, pageCount, items, total, loading, saving, deleting,
  exporting, opening, error, filterError, formError, notice, selected, ready, canMutate,
  hasAppliedFilters, filtersChanged, refresh, applyFilters, resetFilters, changeSort,
  setPage, setPageSize, closeRecord, createRecord, openRecord, saveRecord, removeRecord, exportRecords } = useRegistry();
const displayedRecord = shallowRef(null);
const displayedGeneration = shallowRef(null);
const displayedKey = shallowRef(0);
let midnightTimer;
let surfaceVersion = 0;
let disposed = false;

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
  }
}, { immediate: true });

function updateDate() {
  today.value = localDate();
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(updateDate, next.getTime() - now.getTime() + 100);
}

const guardDraft = async () => editor.value ? editor.value.requestClose() : true;
const unregisterGuard = app.registerUnsavedGuard(guardDraft);
onBeforeRouteLeave(guardDraft);
onBeforeRouteUpdate((to, from) => to.query.instruction === from.query.instruction ? true : guardDraft());

watch([() => route.query.instruction, ready], ([id, isReady]) => {
  if (isReady && id && /^\d+$/.test(String(id))) openRecord(Number(id));
}, { immediate: true });

onMounted(() => { updateDate(); window.addEventListener('focus', updateDate); document.addEventListener('visibilitychange', updateDate); });
onBeforeUnmount(() => { disposed = true; surfaceVersion++; unregisterGuard(); clearTimeout(midnightTimer); window.removeEventListener('focus', updateDate); document.removeEventListener('visibilitychange', updateDate); });
</script>

<template>
  <div class="registry-workspace">
    <div class="registry-toolbar">
      <PageHeading title="Реестр указаний" />
      <div class="registry-actions"><button class="registry-button" type="button" :disabled="!ready || exporting || app.databaseSwitching" @click="exportRecords"><Download :size="17" aria-hidden="true" />{{ exporting ? 'Выгрузка…' : 'Выгрузить Excel' }}</button><button class="registry-button registry-button-primary" type="button" :disabled="!canMutate" @click="createRecord"><FilePlus2 :size="17" aria-hidden="true" />Добавить указание</button></div>
    </div>
    <div v-if="!ready" class="registry-empty registry-no-database"><span class="registry-empty-icon"><ListChecks :size="36" :stroke-width="1.5" aria-hidden="true" /></span><h2>Выберите базу данных</h2><p>{{ app.database?.message || 'Создайте новую базу или откройте существующую в настройках, чтобы вести реестр указаний.' }}</p><RouterLink class="registry-button registry-button-primary" to="/settings">Перейти в настройки</RouterLink></div>
    <template v-else>
      <RegistryFilters :filters="draftFilters" :applied-filters="appliedFilters" :disabled="app.databaseSwitching" :changed="filtersChanged" :error="filterError" @update="({ field, value }) => draftFilters[field] = value" @apply="applyFilters" @reset="resetFilters" />
      <section class="registry-results" aria-label="Найденные указания">
        <div class="registry-results-heading">
          <h2>Записей <span class="registry-count">{{ total }}</span></h2>
          <div class="registry-status-slot"><div v-if="error" class="registry-error-banner" role="alert"><span :title="error">{{ error }}</span><button type="button" class="registry-inline-action" :disabled="loading" @click="refresh"><RefreshCw :size="12" aria-hidden="true" />Повторить</button></div><p v-else-if="notice" class="registry-notice" role="status" :title="notice">{{ notice }}</p><span v-else class="registry-help" role="status">{{ loading ? 'Загрузка…' : opening ? 'Открытие карточки…' : '' }}</span></div>
          <button type="button" class="registry-inline-action registry-column-toggle" :aria-pressed="wideColumns" :title="wideColumns ? 'Уместить восемь столбцов в ширину окна' : 'Увеличить ширину столбцов; доступна прокрутка внутри таблицы'" @click="wideColumns = !wideColumns"><Columns3 :size="14" aria-hidden="true" /><span>{{ wideColumns ? 'По ширине окна' : 'Столбцы шире' }}</span></button>
        </div>
        <RegistryTable v-if="items.length" :items="items" :sort="sort" :loading="loading" :wide="wideColumns" :today="today" @sort="changeSort" @open="openRecord" />
        <div v-else-if="loading" class="registry-empty registry-empty-results" role="status"><RefreshCw :size="28" class="registry-loading-icon" aria-hidden="true" /><h2>Загрузка реестра…</h2></div>
        <div v-else class="registry-empty registry-empty-results"><ListChecks :size="32" :stroke-width="1.5" aria-hidden="true" /><h2>{{ error ? 'Реестр недоступен' : hasAppliedFilters ? 'Указания не найдены' : 'В реестре пока нет указаний' }}</h2><p>{{ error ? 'Повторите загрузку, чтобы показать указания.' : hasAppliedFilters ? 'Измените условия фильтров или сбросьте их.' : 'Добавьте первое указание — его срок появится в календаре.' }}</p><button v-if="error" type="button" class="registry-button" @click="refresh">Повторить загрузку</button><button v-else-if="hasAppliedFilters" type="button" class="registry-button" @click="resetFilters">Сбросить фильтры</button><button v-else type="button" class="registry-button registry-button-primary" :disabled="!canMutate" @click="createRecord">Добавить указание</button></div>
        <RegistryPagination :page="page" :page-size="pageSize" :page-count="pageCount" :total="total" :disabled="loading || app.databaseSwitching" @page="setPage" @page-size="setPageSize" />
      </section>
    </template>
    <InstructionDialog v-if="displayedRecord" :key="displayedKey" ref="editor" :record="displayedRecord" :saving="saving" :deleting="deleting" :error="formError" :closing="!selected" :can-edit="Boolean(selected) && displayedGeneration === app.database?.generation && ready && !app.databaseSwitching" :save-record="saveRecord" :delete-record="removeRecord" @close="closeRecord" />
  </div>
</template>
