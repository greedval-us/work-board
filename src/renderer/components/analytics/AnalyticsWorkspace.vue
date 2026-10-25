<script setup>
import { computed, onScopeDispose } from 'vue';
import { storeToRefs } from 'pinia';
import { BarChart3, RefreshCw } from 'lucide-vue-next';
import { RouterLink } from 'vue-router';
import { formatDate } from '../../../shared/registry.js';
import { useAnalyticsStore } from '../../stores/analyticsStore.js';
import PageHeading from '../ui/PageHeading.vue';
import AnalyticsFilters from './AnalyticsFilters.vue';
import AnalyticsSummary from './AnalyticsSummary.vue';
import AnalyticsCharts from './AnalyticsCharts.vue';
const store = useAnalyticsStore();
const { draftFilters, appliedFilters, data, loading, error, filterError, ready, filtersChanged } = storeToRefs(store);
const period = computed(() => `${appliedFilters.value.from ? formatDate(appliedFilters.value.from) : 'Начало наблюдений'} — ${appliedFilters.value.to ? formatDate(appliedFilters.value.to) : 'без ограничения'}`);
const release = store.acquire(); onScopeDispose(release);
</script>
<template>
  <section class="page analytics-page">
    <div class="analytics-page-heading"><PageHeading title="Аналитика" description="Исполнение указаний и задач в цифрах." /><button type="button" class="analytics-button" :disabled="!ready || loading" @click="store.refresh({ force: true })"><RefreshCw :size="15" aria-hidden="true" />Обновить</button></div>
    <template v-if="ready">
      <AnalyticsFilters :filters="draftFilters" :applied="appliedFilters" :error="filterError" :changed="filtersChanged" @change="Object.assign(draftFilters, $event)" @apply="store.applyFilters" @reset="store.resetFilters" />
      <div class="analytics-period"><span>{{ period }}</span><span v-if="data">Состояние на {{ formatDate(data.asOf) }}</span></div>
      <p v-if="loading" class="analytics-empty" role="status">Рассчитываем показатели…</p>
      <div v-else-if="error" class="analytics-form-error" role="alert">{{ error }} <button type="button" class="analytics-button" @click="store.refresh({ force: true })">Повторить</button></div>
      <template v-else-if="data"><AnalyticsSummary :totals="data.totals" /><AnalyticsCharts v-if="data.totals.total" :data="data" /><div v-else class="analytics-empty"><BarChart3 :size="32" aria-hidden="true" /><h2>В этой выборке нет записей</h2><p>Измените период, статус или другие условия.</p><button type="button" class="analytics-button" @click="store.resetFilters">Показать все записи</button></div></template>
    </template>
    <div v-else class="analytics-empty"><BarChart3 :size="36" aria-hidden="true" /><h2>Подключите базу данных</h2><p>Для аналитики выберите или создайте базу в настройках.</p><RouterLink class="analytics-button analytics-button-primary" to="/settings">Открыть настройки</RouterLink></div>
  </section>
</template>
