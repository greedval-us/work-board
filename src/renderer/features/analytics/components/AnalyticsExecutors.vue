<script setup>
import { useId } from 'vue';
import { vResizableColumns } from '../../../ui/resizableColumns.js';

defineProps({ rows: { type: Array, required: true } });
const headingId = useId();
const metrics = [
  { key: 'total', label: 'Всего' },
  { key: 'active', label: 'Активные', short: 'Актив.' },
  { key: 'closed', label: 'Закрыто' },
  { key: 'overdue', label: 'Просрочено', short: 'Проср.' },
];
</script>

<template>
  <section class="analytics-chart-card analytics-executors">
    <header><h2 :id="headingId">По исполнителям</h2></header>
    <div class="analytics-table-scroll" role="region" :aria-labelledby="headingId" tabindex="0">
      <table v-resizable-columns="'analytics-executors'" class="analytics-data-table analytics-executors-table" :aria-labelledby="headingId">
        <thead>
          <tr>
            <th scope="col">Исполнитель</th>
            <th v-for="metric in metrics" :key="metric.key" scope="col" :aria-label="metric.label" :title="metric.label">
              <span :class="{ 'analytics-full-label': metric.short }">{{ metric.label }}</span>
              <span v-if="metric.short" class="analytics-short-label" aria-hidden="true">{{ metric.short }}</span>
            </th>
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
