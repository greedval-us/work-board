<script setup>
import { computed } from 'vue';
const props = defineProps({ title: { type: String, required: true }, caption: String, rows: { type: Array, required: true } });
const maximum = computed(() => Math.max(1, ...props.rows.map(row => row.total)));
</script>
<template>
  <section class="analytics-chart-card"><header><h2>{{ title }}</h2><p>{{ caption }}</p></header><ul class="analytics-bars"><li v-for="row in rows" :key="row.key"><div class="analytics-bar-label"><span>{{ row.label }}</span><strong>{{ row.total.toLocaleString('ru-RU') }}</strong></div><div class="analytics-bar-track" aria-hidden="true"><span :class="`analytics-fill-${row.tone ?? 'accent'}`" :style="{ width: `${row.total / maximum * 100}%` }" /></div><small v-if="row.completed !== undefined">Выполнено: {{ row.completed }}</small></li></ul></section>
</template>
