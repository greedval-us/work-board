<script setup>
import { computed } from 'vue';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';
import { getTaskPriorityPresentation } from '../../presentation/taskPriorities.js';
import { showTaskPriorityBreakdown } from '../../domain/analytics.js';
import AnalyticsBreakdown from './AnalyticsBreakdown.vue';
import AnalyticsTimeline from './AnalyticsTimeline.vue';
const props = defineProps({ data: { type: Object, required: true } });
const statusRows = computed(() => [
  { key: 'pending', label: 'Указания на контроле', total: props.data.totals.pending, tone: 'muted' },
  { key: 'inProgress', label: 'Указания в работе', total: props.data.totals.inProgress, tone: 'warning' },
  { key: 'activeTasks', label: 'Активные задачи', total: props.data.totals.activeTasks, tone: 'accent' },
  { key: 'completed', label: 'Выполненные записи', total: props.data.totals.completed, tone: 'success' },
]);
const priorityRows = computed(() => props.data.priorities.map(row => ({ ...row, ...getTaskPriorityPresentation(row.key, 'accent') })));
const typeRows = computed(() => props.data.types.map(row => ({ ...row, label: row.key === ENTITY_TYPES.TASKS ? 'Задачи' : 'Указания', tone: 'accent' })));
const showPriorities = computed(() => showTaskPriorityBreakdown(props.data.filters));
</script>
<template>
  <div class="analytics-chart-grid">
    <AnalyticsBreakdown title="Статусы исполнения" caption="Текущее состояние выбранных записей" :rows="statusRows" />
    <section class="analytics-chart-card analytics-progress-card"><header><h2>Доля выполнения</h2><p>Выполненные записи среди всех выбранных</p></header><div class="analytics-progress"><svg viewBox="0 0 120 120" role="img" :aria-label="`Выполнено ${data.totals.completionRate} процентов`"><circle class="analytics-ring-track" cx="60" cy="60" r="46" /><circle class="analytics-ring-value" cx="60" cy="60" r="46" pathLength="100" :stroke-dasharray="`${data.totals.completionRate} 100`" transform="rotate(-90 60 60)" /><text x="60" y="60" text-anchor="middle" dominant-baseline="central">{{ data.totals.completionRate }}%</text></svg><div><strong>{{ data.totals.completed }} из {{ data.totals.total }}</strong><p>записей выполнено</p><span>{{ data.totals.active }} ещё активны</span></div></div></section>
    <AnalyticsTimeline :timeline="data.timeline" />
    <AnalyticsBreakdown v-if="showPriorities" title="Важность задач" caption="Количество задач и их исполнение" :rows="priorityRows" />
    <AnalyticsBreakdown v-else title="Типы записей" caption="Количество и исполнение в выбранной выборке" :rows="typeRows" />
  </div>
</template>
