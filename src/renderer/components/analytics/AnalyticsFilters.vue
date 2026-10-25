<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-vue-next';
import { ANALYTICS_STATUSES } from '../../../shared/analytics.js';
import { TASK_PRIORITIES } from '../../../shared/registry.js';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { ANALYTICS_PERIODS, applyAnalyticsPeriod, changeAnalyticsFilter, isAnalyticsStatusAvailable, supportsInstructionFilters, supportsTaskFilters } from '../../domain/analytics.js';
import { INSTRUCTION_FORM_LIMITS } from '../../constants/inputLimits.js';

const props = defineProps({ filters: { type: Object, required: true }, applied: { type: Object, required: true }, error: String, changed: Boolean, disabled: Boolean });
const emit = defineEmits(['change', 'apply', 'reset']);
const expanded = shallowRef(false);
const fieldsId = useId();
const activeCount = computed(() => Object.values(props.applied).filter(Boolean).length);
watch(() => props.error, error => { if (error) expanded.value = true; });
const showPriority = computed(() => supportsTaskFilters(props.filters.entityType));
const showExecutor = computed(() => supportsInstructionFilters(props.filters.entityType));
const statusOptions = computed(() => Object.entries(ANALYTICS_STATUSES).map(([value, label]) => ({ value, label, disabled: !isAnalyticsStatusAvailable(props.filters.entityType, value) })));
const periods = [
  { value: ANALYTICS_PERIODS.MONTH, label: 'Этот месяц' },
  { value: ANALYTICS_PERIODS.YEAR, label: 'Этот год' },
  { value: ANALYTICS_PERIODS.ALL, label: 'Всё время' },
];
function change(key, value) {
  emit('change', changeAnalyticsFilter(props.filters, key, value));
}
function preset(value) {
  emit('change', applyAnalyticsPeriod(props.filters, value));
  emit('apply');
}
</script>

<template>
  <form class="analytics-filters" @submit.prevent="$emit('apply')">
    <div class="analytics-filter-heading"><button type="button" class="analytics-filter-toggle" :aria-expanded="expanded" :aria-controls="fieldsId" @click="expanded = !expanded"><SlidersHorizontal :size="15" aria-hidden="true" />Фильтры <span v-if="activeCount" class="analytics-filter-badge">{{ activeCount }}</span><span v-if="changed" class="analytics-filter-dirty" title="Есть неприменённые изменения" /><ChevronDown :size="14" class="analytics-filter-chevron" :class="{ 'analytics-filter-chevron-open': expanded }" aria-hidden="true" /></button><div class="analytics-presets"><button v-for="period in periods" :key="period.value" type="button" :disabled="disabled" @click="preset(period.value)">{{ period.label }}</button></div></div>
    <div v-show="expanded" :id="fieldsId" class="analytics-filter-body">
    <fieldset class="analytics-filter-fields" :disabled="disabled">
      <label class="analytics-field">Срок с<input :value="filters.from" name="analytics-from" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" @input="change('from', $event.target.value)" /></label>
      <label class="analytics-field">Срок по<input :value="filters.to" name="analytics-to" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" @input="change('to', $event.target.value)" /></label>
      <label class="analytics-field">Тип записи<select :value="filters.entityType" name="analytics-type" @change="change('entityType', $event.target.value)"><option value="">Указания и задачи</option><option :value="ENTITY_TYPES.INSTRUCTIONS">Указания</option><option :value="ENTITY_TYPES.TASKS">Задачи</option></select></label>
      <label class="analytics-field">Статус<select :value="filters.status" name="analytics-status" @change="change('status', $event.target.value)"><option value="">Все статусы</option><option v-for="option in statusOptions" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option></select></label>
      <label v-if="showPriority" class="analytics-field">Важность задач<select :value="filters.priority" name="analytics-priority" @change="change('priority', $event.target.value)"><option value="">Любая важность</option><option v-for="(label, value) in TASK_PRIORITIES" :key="value" :value="value">{{ label }}</option></select></label>
      <label v-if="showExecutor" class="analytics-field">Исполнитель указания<input :value="filters.executor" name="analytics-executor" type="search" :maxlength="INSTRUCTION_FORM_LIMITS.executor" placeholder="Любой исполнитель" @input="change('executor', $event.target.value)" /></label>
    </fieldset>
    <p v-if="error" class="analytics-form-error" role="alert">{{ error }}</p>
    <div class="analytics-filter-footer"><p>Период — по сроку исполнения. Важность отбирает задачи, исполнитель — указания.</p><span v-if="changed" class="analytics-draft-note">Есть неприменённые изменения</span><button class="analytics-button" type="button" :disabled="disabled" @click="$emit('reset')"><RotateCcw :size="14" aria-hidden="true" />Сбросить</button><button class="analytics-button analytics-button-primary" type="submit" :disabled="disabled">Применить</button></div>
    </div>
  </form>
</template>
