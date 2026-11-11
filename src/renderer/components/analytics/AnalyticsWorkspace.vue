<script setup>
import { computed, onScopeDispose } from 'vue';
import { storeToRefs } from 'pinia';
import { BarChart3, RefreshCw } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import { formatDate } from '../../../shared/registry.js';
import { useAnalyticsStore } from '../../stores/analyticsStore.js';
import { useAppStore } from '../../stores/appStore.js';
import { analyticsExecutorOptions } from '../../domain/analytics.js';
import PageHeading from '../ui/PageHeading.vue';
import AnalyticsFilters from './AnalyticsFilters.vue';
import AnalyticsSummary from './AnalyticsSummary.vue';
import AnalyticsExecutors from './AnalyticsExecutors.vue';
import AnalyticsInstructions from './AnalyticsInstructions.vue';
import AnalyticsCharts from './AnalyticsCharts.vue';
const store = useAnalyticsStore();
const app = useAppStore();
const { draftFilters, appliedFilters, executorOptions, data, loading, error, filterError, ready, filtersChanged } = storeToRefs(store);
const period = computed(() => `${appliedFilters.value.from ? formatDate(appliedFilters.value.from) : 'Начало наблюдений'} — ${appliedFilters.value.to ? formatDate(appliedFilters.value.to) : 'без ограничения'}`);
const executors = computed(() => analyticsExecutorOptions(executorOptions.value, app.registryOptions.executor, appliedFilters.value.executor));
const release = store.acquire(); onScopeDispose(release);
const refresh = () => store.refresh({ force: true, keepData: Boolean(data.value) });
</script>
<template>
  <section class="page analytics-page">
    <div class="analytics-page-heading"><PageHeading title="Аналитика" description="Исполнение указаний по срокам и исполнителям." /><button type="button" class="analytics-button" :disabled="!ready || loading" @click="refresh"><RefreshCw :size="15" aria-hidden="true" />Обновить</button></div>
    <template v-if="ready">
      <AnalyticsFilters :filters="draftFilters" :applied="appliedFilters" :executors="executors" :error="filterError"
        :changed="filtersChanged" :disabled="app.databaseSwitching" @change="Object.assign(draftFilters, $event)"
        @select-executor="store.selectExecutor" @apply="store.applyFilters" @reset="store.resetFilters" />
      <div class="analytics-period">
        <span>{{ period }}</span>
        <span v-if="data">Состояние на {{ formatDate(data.asOf) }}</span>
      </div>
      <div v-if="error" class="analytics-form-error" role="alert">{{ error }} <button type="button" class="analytics-button" @click="refresh">Повторить</button></div>
      <p v-if="loading && !data" class="analytics-empty" role="status">Рассчитываем показатели…</p>
      <template v-else-if="data">
        <AnalyticsSummary :totals="data.totals" />
        <template v-if="data.totals.total">
          <AnalyticsInstructions v-if="data.instructions" :result="data.instructions" :loading="loading" @page="store.setPage" />
          <AnalyticsExecutors :rows="data.executors" />
          <AnalyticsCharts :data="data" />
        </template>
        <div v-else class="analytics-empty">
          <BarChart3 :size="32" aria-hidden="true" />
          <h2>По этим фильтрам нет указаний</h2>
          <p>Измените период, статус или исполнителя.</p>
          <button type="button" class="analytics-button" @click="store.resetFilters">Показать все указания</button>
        </div>
      </template>
    </template>
    <div v-else class="analytics-empty"><BarChart3 :size="36" aria-hidden="true" /><h2>Подключите базу данных</h2><p>Для аналитики выберите или создайте базу в настройках.</p><RouterLink class="analytics-button analytics-button-primary" to="/settings">Открыть настройки</RouterLink></div>
  </section>
</template>
