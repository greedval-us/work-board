<script setup>
import { computed } from 'vue';
import { ArrowDown, ArrowUp } from 'lucide-vue-next';
import { CONTROL_FREQUENCIES } from '../../../shared/controlSchedule.js';
import { formatDate, getUrgency, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES } from '../../../shared/registry.js';

const props = defineProps({ items: { type: Array, required: true }, sort: { type: Object, required: true }, loading: Boolean, wide: Boolean, today: { type: String, required: true } });
const emit = defineEmits(['sort', 'open']);
const rows = computed(() => props.items.map((item) => ({
  ...item,
  urgency: getUrgency(item, props.today),
  checkpointLabel: formatDate(item.nextCheckpoint),
  checkpointOverdue: Boolean(item.nextCheckpoint && item.nextCheckpoint < props.today),
  frequencyLabel: item.controlFrequency ? CONTROL_FREQUENCIES[item.controlFrequency] : '',
  dates: [
    { key: 'deadline', value: item.deadline, showUrgency: !item.extendedUntil },
    { key: 'extendedUntil', value: item.extendedUntil, showUrgency: Boolean(item.extendedUntil) },
  ].map(date => ({ ...date, label: formatDate(date.value) })),
})));
const ariaSort = (key) => props.sort.field === key ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
const columnLabels = { controlDate: 'На контроле с', incomingNumber: 'Вх. №', title: 'Название', deadline: 'Срок', executionMark: 'Исполнение' };
</script>

<template>
  <div class="registry-table-scroll" :class="{ 'registry-table-scroll-wide': props.wide }" role="region" :aria-label="props.wide ? 'Реестр указаний, прокрутка списка и широких столбцов' : 'Реестр указаний, прокрутка списка'" tabindex="0" :aria-busy="props.loading">
    <table class="registry-table" :class="{ 'registry-table-wide': props.wide }">
      <caption class="registry-visually-hidden">Реестр контролируемых указаний. Откройте название указания для просмотра и редактирования.</caption>
      <thead><tr><th v-for="column in INSTRUCTION_COLUMNS" :key="column.key" :data-column="column.key" scope="col" :aria-sort="ariaSort(column.key)" :title="column.label">
        <button type="button" class="registry-sort" :aria-label="`Сортировать: ${column.label}`" @click="emit('sort', column.key)">
          <span v-if="column.key === 'nextCheckpoint'" class="registry-checkpoint-heading">
            <span class="registry-checkpoint-heading-full">{{ column.label }}</span>
            <span class="registry-checkpoint-heading-short">Ближ. контроль</span>
          </span>
          <span v-else-if="column.key === 'controlFrequency'" class="registry-frequency-heading">
            <span class="registry-frequency-heading-full">{{ column.label }}</span>
            <span class="registry-frequency-heading-short">Период</span>
          </span>
          <span v-else>{{ columnLabels[column.key] ?? column.label }}</span>
          <ArrowUp v-if="props.sort.field === column.key && props.sort.direction === 'asc'" :size="12" aria-hidden="true" />
          <ArrowDown v-else-if="props.sort.field === column.key" :size="12" aria-hidden="true" />
        </button>
      </th></tr></thead>
      <tbody>
        <tr v-for="item in rows" :key="item.id" class="registry-row" @click="emit('open', item.id)">
          <td><span class="registry-cell-text registry-number" :title="String(item.id)">{{ item.id }}</span></td>
          <td><time class="registry-cell-date" :datetime="item.controlDate" :title="formatDate(item.controlDate)" :aria-label="formatDate(item.controlDate)"><span class="registry-date-full">{{ formatDate(item.controlDate) }}</span><span class="registry-date-short" aria-hidden="true">{{ formatDate(item.controlDate).slice(0, 5) }}</span></time></td>
          <td><span class="registry-cell-text" :title="item.incomingNumber">{{ item.incomingNumber || '—' }}</span></td>
          <td><span class="registry-cell-text registry-number" :title="item.instructionNumber">{{ item.instructionNumber }}</span></td>
          <td><span class="registry-cell-text" :title="item.source">{{ item.source || '—' }}</span></td>
          <td><button class="registry-record-link" type="button" @click.stop="emit('open', item.id)"><span class="registry-cell-text" :title="item.title">{{ item.title }}</span></button></td>
          <td><span class="registry-cell-summary" :title="item.summary">{{ item.summary || '—' }}</span></td>
          <td v-for="date in item.dates" :key="date.key">
            <time v-if="date.value" class="registry-cell-date registry-date" :datetime="date.value" :title="date.label" :aria-label="date.label"><span class="registry-date-full">{{ date.label }}</span><span class="registry-date-short" aria-hidden="true">{{ date.label.slice(0, 5) }}</span></time>
            <span v-else>—</span>
            <span v-if="date.showUrgency" class="registry-urgency" :class="`registry-tone-${item.urgency.tone}`" :title="item.urgency.label">{{ item.urgency.label }}</span>
          </td>
          <td data-column="nextCheckpoint">
            <button v-if="item.nextCheckpoint" type="button" class="registry-record-link registry-checkpoint-link"
              :title="`Открыть отметку за ${item.checkpointLabel}`"
              :aria-label="`Открыть отметку об исполнении за ${item.checkpointLabel}${item.checkpointOverdue ? ' · Просрочено' : ''}`"
              @click.stop="emit('open', item.id, item.nextCheckpoint)">
              <time class="registry-cell-date" :class="{ 'registry-checkpoint-overdue': item.checkpointOverdue }" :datetime="item.nextCheckpoint">
                <span class="registry-date-full">{{ item.checkpointLabel }}</span><span class="registry-date-short" aria-hidden="true">{{ item.checkpointLabel.slice(0, 5) }}</span>
              </time>
            </button>
            <span v-else>—</span>
            <span v-if="item.checkpointOverdue" class="registry-urgency registry-tone-danger" aria-hidden="true" title="Просрочено">Просрочено</span>
          </td>
          <td><span class="registry-cell-text" :title="item.executor">{{ item.executor }}</span></td>
          <td data-column="controlFrequency"><span class="registry-cell-text" :title="item.frequencyLabel">{{ item.frequencyLabel || '—' }}</span></td>
          <td><span class="registry-status" :class="`registry-status-${item.status}`">{{ INSTRUCTION_STATUSES[item.status] }}</span><span v-if="item.executionMark" class="registry-cell-summary registry-mark" :title="item.executionMark">{{ item.executionMark }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
