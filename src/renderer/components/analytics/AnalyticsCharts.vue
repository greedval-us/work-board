<script setup>
import { computed } from 'vue';
import { INSTRUCTION_STATUS, INSTRUCTION_STATUSES } from '../../../shared/registry.js';
import AnalyticsBreakdown from './AnalyticsBreakdown.vue';
import AnalyticsTimeline from './AnalyticsTimeline.vue';
const props = defineProps({ data: { type: Object, required: true } });
const statusRows = computed(() => [
  { key: 'pending', label: INSTRUCTION_STATUSES[INSTRUCTION_STATUS.PENDING], total: props.data.totals.pending, tone: 'muted' },
  { key: 'inProgress', label: INSTRUCTION_STATUSES[INSTRUCTION_STATUS.IN_PROGRESS], total: props.data.totals.inProgress, tone: 'warning' },
  { key: 'completed', label: INSTRUCTION_STATUSES[INSTRUCTION_STATUS.COMPLETED], total: props.data.totals.completed, tone: 'success' },
]);
</script>
<template>
  <div class="analytics-chart-grid">
    <AnalyticsBreakdown title="Статусы исполнения" :rows="statusRows" />
    <section class="analytics-chart-card analytics-progress-card"><header><h2>Доля выполнения</h2></header><div class="analytics-progress"><svg viewBox="0 0 120 120" role="img" :aria-label="`Выполнено ${data.totals.completionRate} процентов`"><circle class="analytics-ring-track" cx="60" cy="60" r="46" /><circle class="analytics-ring-value" cx="60" cy="60" r="46" pathLength="100" :stroke-dasharray="`${data.totals.completionRate} 100`" transform="rotate(-90 60 60)" /><text x="60" y="60" text-anchor="middle" dominant-baseline="central">{{ data.totals.completionRate }}%</text></svg><div><strong>{{ data.totals.completed }} из {{ data.totals.total }}</strong><p>указаний выполнено</p><span>{{ data.totals.active }} ещё активны</span></div></div></section>
    <AnalyticsTimeline :timeline="data.timeline" />
  </div>
</template>
