<script setup>
import { computed } from 'vue';
const props = defineProps({ timeline: { type: Array, required: true } });
const maximum = computed(() => Math.max(1, ...props.timeline.map(row => row.total)));
const monthLabel = month => `${month.slice(5)}.${month.slice(0, 4)}`;
</script>
<template>
  <section class="analytics-chart-card analytics-timeline"><header><h2>Исполнение по месяцам</h2><p>Указания сгруппированы по сроку с учётом продления.</p></header><div class="analytics-chart-legend"><span><i class="analytics-fill-success" />Выполнено</span><span><i class="analytics-fill-accent" />Активные</span></div><ul class="analytics-months"><li v-for="row in timeline" :key="row.month"><span class="analytics-month-label">{{ monthLabel(row.month) }}</span><div class="analytics-month-track" aria-hidden="true"><span class="analytics-fill-success" :style="{ width: `${row.completed / maximum * 100}%` }" /><span class="analytics-fill-accent" :style="{ width: `${row.active / maximum * 100}%` }" /></div><span class="analytics-month-value" :title="`Выполнено: ${row.completed}, активных: ${row.active}, всего: ${row.total}`">{{ row.completed }} / {{ row.total }}<span class="analytics-sr-only"> выполнено / всего</span></span></li></ul><p class="analytics-chart-footnote">Справа указано количество выполненных и общее число указаний.</p></section>
</template>
