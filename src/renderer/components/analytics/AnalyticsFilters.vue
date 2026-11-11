<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-vue-next';
import { ANALYTICS_STATUSES } from '../../../shared/analytics.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { ANALYTICS_PERIODS, applyAnalyticsPeriod } from '../../domain/analytics.js';

const props = defineProps({ filters: { type: Object, required: true }, applied: { type: Object, required: true },
  executors: { type: Array, required: true }, error: String, changed: Boolean, disabled: Boolean });
const emit = defineEmits(['change', 'apply', 'reset', 'select-executor']);
const expanded = shallowRef(false);
const fieldsId = useId();
const activeCount = computed(() => [props.applied.from, props.applied.to, props.applied.status].filter(Boolean).length);
watch(() => props.error, error => { if (error) expanded.value = true; });
const periods = [
  { value: ANALYTICS_PERIODS.MONTH, label: 'Этот месяц' },
  { value: ANALYTICS_PERIODS.YEAR, label: 'Этот год' },
  { value: ANALYTICS_PERIODS.ALL, label: 'Всё время' },
];
function change(key, value) {
  emit('change', { [key]: value });
}
function preset(value) {
  emit('change', applyAnalyticsPeriod(props.filters, value));
  emit('apply');
}
</script>

<template>
  <form class="analytics-filters" @submit.prevent="$emit('apply')">
    <div class="analytics-filter-heading">
      <label class="analytics-field analytics-executor-choice">
        <span>Исполнитель</span>
        <select :value="applied.executor" name="analytics-executor" :disabled="disabled" @change="$emit('select-executor', $event.target.value)">
          <option value="">Все исполнители</option>
          <option v-for="executor in executors" :key="executor.key" :value="executor.key">{{ executor.label }}</option>
        </select>
      </label>
      <div class="analytics-filter-tools">
        <button type="button" class="analytics-filter-toggle" :aria-expanded="expanded" :aria-controls="fieldsId" @click="expanded = !expanded"><SlidersHorizontal :size="15" aria-hidden="true" />Фильтры <span v-if="activeCount" class="analytics-filter-badge">{{ activeCount }}</span><span v-if="changed" class="analytics-filter-dirty" title="Есть неприменённые изменения" /><ChevronDown :size="14" class="analytics-filter-chevron" :class="{ 'analytics-filter-chevron-open': expanded }" aria-hidden="true" /></button>
        <div class="analytics-presets"><button v-for="period in periods" :key="period.value" type="button" :disabled="disabled" @click="preset(period.value)">{{ period.label }}</button></div>
      </div>
    </div>
    <div v-show="expanded" :id="fieldsId" class="analytics-filter-body">
    <fieldset class="analytics-filter-fields" :disabled="disabled">
      <label class="analytics-field">Срок с<input :value="filters.from" name="analytics-from" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" @input="change('from', $event.target.value)" /></label>
      <label class="analytics-field">Срок по<input :value="filters.to" name="analytics-to" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" @input="change('to', $event.target.value)" /></label>
      <label class="analytics-field">Статус<select :value="filters.status" name="analytics-status" @change="change('status', $event.target.value)"><option value="">Все статусы</option><option v-for="(label, value) in ANALYTICS_STATUSES" :key="value" :value="value">{{ label }}</option></select></label>
    </fieldset>
    <p v-if="error" class="analytics-form-error" role="alert">{{ error }}</p>
    <div class="analytics-filter-footer"><p>Период учитывает продлённый срок исполнения.</p><span v-if="changed" class="analytics-draft-note">Есть неприменённые изменения</span><button class="analytics-button" type="button" :disabled="disabled" @click="$emit('reset')"><RotateCcw :size="14" aria-hidden="true" />Сбросить</button><button class="analytics-button analytics-button-primary" type="submit" :disabled="disabled">Применить</button></div>
    </div>
  </form>
</template>
