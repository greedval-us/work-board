<script setup>
import { computed } from 'vue';
import { Archive, ArrowDown, ArrowUp } from 'lucide-vue-next';
import { CONTROL_FREQUENCIES } from '../../../shared/controlSchedule.js';
import { formatDate, getUrgency, INSTRUCTION_COLUMNS, localDate } from '../../../shared/registry.js';

const props = defineProps({ items: { type: Array, required: true }, sort: { type: Object, required: true }, loading: Boolean,
  wide: Boolean, today: { type: String, required: true }, closed: Boolean, canCloseControl: Boolean,
  sectionTitle: { type: String, required: true } });
const emit = defineEmits(['sort', 'open', 'close-control']);

function deadlineAlert(item) {
  if (props.closed) return null;
  const urgency = getUrgency(item, props.today);
  return urgency.tone === 'warning' || urgency.tone === 'danger' ? urgency : null;
}

const rows = computed(() => props.items.map((item) => ({
  ...item,
  deadlineAlert: deadlineAlert(item),
  closedDate: item.closedAt ? localDate(new Date(item.closedAt)) : '',
  checkpointLabel: formatDate(item.nextCheckpoint),
  checkpointOverdue: Boolean(item.nextCheckpoint && item.nextCheckpoint < props.today),
  frequencyLabel: item.controlFrequency ? CONTROL_FREQUENCIES[item.controlFrequency] : '',
  dates: [
    { key: 'deadline', value: item.deadline, showUrgency: !item.extendedUntil },
    { key: 'extendedUntil', value: item.extendedUntil, showUrgency: Boolean(item.extendedUntil) },
  ].map(date => ({ ...date, label: formatDate(date.value) })),
})));
const ariaSort = (key) => props.sort.field === key ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
const columnLabels = { controlDate: 'На контроле с', incomingNumber: 'Вх. №', title: 'Название', deadline: 'Срок', executionMark: 'Отметка' };
</script>

<template>
  <div class="registry-table-scroll" :class="{ 'registry-table-scroll-wide': props.wide }" role="region" :aria-label="`${props.sectionTitle}, прокрутка списка${props.wide ? ' и широких столбцов' : ''}`" tabindex="0" :aria-busy="props.loading">
    <table class="registry-table" :class="{ 'registry-table-wide': props.wide, 'registry-table-with-actions': !props.closed }">
      <caption class="registry-visually-hidden">{{ props.sectionTitle }}. Откройте название указания для просмотра и редактирования.</caption>
      <thead><tr><th v-for="column in INSTRUCTION_COLUMNS" :key="column.key" :data-column="column.key" scope="col" :aria-sort="props.closed && column.key === 'nextCheckpoint' ? undefined : ariaSort(column.key)" :title="props.closed && column.key === 'nextCheckpoint' ? 'Дата закрытия' : column.label">
        <span v-if="props.closed && column.key === 'nextCheckpoint'" class="registry-static-heading">Дата закрытия</span>
        <button v-else type="button" class="registry-sort" :aria-label="`Сортировать: ${column.label}`" @click="emit('sort', column.key)">
          <span v-if="column.key === 'nextCheckpoint'" class="registry-checkpoint-heading">
            <span class="registry-checkpoint-heading-full">{{ column.label }}</span>
            <span class="registry-checkpoint-heading-short">Ближ. контроль</span>
          </span>
          <span v-else-if="column.key === 'controlFrequency'" class="registry-frequency-heading">
            <span class="registry-frequency-heading-full">{{ column.label }}</span>
            <span class="registry-frequency-heading-short">Период</span>
          </span>
          <span v-else-if="column.key === 'documentType'">
            <span class="registry-document-type-heading-full">{{ column.label }}</span>
            <span class="registry-document-type-heading-short">Вид</span>
          </span>
          <span v-else>{{ columnLabels[column.key] ?? column.label }}</span>
          <ArrowUp v-if="props.sort.field === column.key && props.sort.direction === 'asc'" :size="12" aria-hidden="true" />
          <ArrowDown v-else-if="props.sort.field === column.key" :size="12" aria-hidden="true" />
        </button>
      </th><th v-if="!props.closed" data-column="actions" scope="col"><span class="registry-visually-hidden">Действия</span></th></tr></thead>
      <tbody>
        <tr v-for="item in rows" :key="item.id" class="registry-row" @click="emit('open', item.id)">
          <td><span class="registry-cell-text registry-number" :title="String(item.id)">{{ item.id }}</span></td>
          <td><time class="registry-cell-date" :datetime="item.controlDate" :title="formatDate(item.controlDate)" :aria-label="formatDate(item.controlDate)"><span class="registry-date-full">{{ formatDate(item.controlDate) }}</span><span class="registry-date-short" aria-hidden="true">{{ formatDate(item.controlDate).slice(0, 5) }}</span></time></td>
          <td><span class="registry-cell-text" :title="item.incomingNumber">{{ item.incomingNumber || '—' }}</span></td>
          <td><span class="registry-cell-text registry-number" :title="item.instructionNumber">{{ item.instructionNumber }}</span></td>
          <td data-column="documentType"><span class="registry-cell-text" :title="item.documentType">{{ item.documentType || '—' }}</span></td>
          <td><span class="registry-cell-text" :title="item.source">{{ item.source || '—' }}</span></td>
          <td><button class="registry-record-link" type="button" @click.stop="emit('open', item.id)"><span class="registry-cell-text" :title="item.title">{{ item.title }}</span></button></td>
          <td><span class="registry-cell-summary" :title="item.summary">{{ item.summary || '—' }}</span></td>
          <td v-for="date in item.dates" :key="date.key">
            <time v-if="date.value" class="registry-cell-date registry-date" :datetime="date.value" :title="date.label" :aria-label="date.label"><span class="registry-date-full">{{ date.label }}</span><span class="registry-date-short" aria-hidden="true">{{ date.label.slice(0, 5) }}</span></time>
            <span v-else>—</span>
            <span v-if="date.showUrgency && item.deadlineAlert" class="registry-urgency" :class="`registry-tone-${item.deadlineAlert.tone}`" :title="item.deadlineAlert.label">{{ item.deadlineAlert.label }}</span>
          </td>
          <td v-if="props.closed" data-column="closedAt">
            <time v-if="item.closedAt" class="registry-cell-date" :datetime="item.closedAt" :title="formatDate(item.closedDate)" :aria-label="formatDate(item.closedDate)">
              <span class="registry-date-full">{{ formatDate(item.closedDate) }}</span><span class="registry-date-short" aria-hidden="true">{{ formatDate(item.closedDate).slice(0, 5) }}</span>
            </time>
            <span v-else>—</span>
          </td>
          <td v-else data-column="nextCheckpoint">
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
          <td data-column="executionMark"><span class="registry-cell-summary" :title="item.executionMark">{{ item.executionMark || '—' }}</span></td>
          <td v-if="!props.closed" data-column="actions">
            <button v-if="!item.closedAt" class="registry-inline-action registry-row-close-control" type="button" aria-label="Закрытие контроля" title="Закрытие контроля" :disabled="!props.canCloseControl" @click.stop="emit('close-control', item)">
              <Archive :size="16" aria-hidden="true" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
