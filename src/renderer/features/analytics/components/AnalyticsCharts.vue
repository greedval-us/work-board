<script setup>
import AnalyticsTimeline from './AnalyticsTimeline.vue';

defineProps({ data: { type: Object, required: true } });
</script>
<template>
  <div class="analytics-chart-grid">
    <section class="analytics-chart-card analytics-progress-card">
      <header><h2>Доля закрытых указаний</h2></header>
      <div class="analytics-progress">
        <svg viewBox="0 0 120 120" role="img" :aria-label="`Закрыто ${data.totals.closedRate}% указаний`">
          <circle class="analytics-ring-track" cx="60" cy="60" r="46" />
          <circle class="analytics-ring-value" cx="60" cy="60" r="46" pathLength="100"
            :stroke-dasharray="`${data.totals.closedRate} 100`" transform="rotate(-90 60 60)" />
          <text x="60" y="60" text-anchor="middle" dominant-baseline="central">{{ data.totals.closedRate }}%</text>
        </svg>
        <div><strong>{{ data.totals.closed }} из {{ data.totals.total }}</strong><p>указаний закрыто</p></div>
      </div>
    </section>
    <AnalyticsTimeline :timeline="data.timeline" />
  </div>
</template>
