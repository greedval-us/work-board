<script setup>
import { useId } from 'vue';

defineProps({ rows: { type: Array, required: true } });
const headingId = useId();
const metrics = [
  { key: 'total', label: 'Всего' },
  { key: 'active', label: 'Активные' },
  { key: 'completed', label: 'Выполнено' },
  { key: 'overdue', label: 'Просрочено' },
];
</script>

<template>
  <section class="analytics-chart-card analytics-executors">
    <header><h2 :id="headingId">По исполнителям</h2></header>
    <div class="analytics-table-scroll" role="region" :aria-labelledby="headingId" tabindex="0">
      <table class="analytics-data-table analytics-executors-table" :aria-labelledby="headingId">
        <thead>
          <tr>
            <th scope="col">Исполнитель</th>
            <th v-for="metric in metrics" :key="metric.key" scope="col">{{ metric.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :data-executor="row.label">
            <th scope="row">{{ row.label }}</th>
            <td v-for="metric in metrics" :key="metric.key" :data-executor-metric="metric.key">
              {{ row[metric.key].toLocaleString('ru-RU') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
