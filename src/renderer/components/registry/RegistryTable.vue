<script setup>
import { computed } from 'vue';
import { ArrowDown, ArrowUp } from 'lucide-vue-next';
import { formatDate, getUrgency, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES } from '../../../shared/registry.js';

const props = defineProps({ items: { type: Array, required: true }, sort: { type: Object, required: true }, loading: Boolean, wide: Boolean, today: { type: String, required: true } });
const emit = defineEmits(['sort', 'open']);
const rows = computed(() => props.items.map((item) => ({ ...item, urgency: getUrgency(item, props.today) })));
const ariaSort = (key) => props.sort.field === key ? (props.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
const columnLabels = { controlDate: 'На контроле с', incomingNumber: 'Вх. №', instructionNumber: 'Указание №', title: 'Название', summary: 'Содержание', deadline: 'Срок', executor: 'Исполнитель', executionMark: 'Исполнение' };
</script>

<template>
  <div class="registry-table-scroll" :class="{ 'registry-table-scroll-wide': props.wide }" role="region" :aria-label="props.wide ? 'Реестр указаний, прокрутка списка и широких столбцов' : 'Реестр указаний, прокрутка списка'" tabindex="0" :aria-busy="props.loading">
    <table class="registry-table" :class="{ 'registry-table-wide': props.wide }">
      <caption class="registry-visually-hidden">Реестр контролируемых указаний. Откройте название указания для просмотра и редактирования.</caption>
      <thead><tr><th v-for="column in INSTRUCTION_COLUMNS" :key="column.key" scope="col" :aria-sort="ariaSort(column.key)" :title="column.label"><button type="button" class="registry-sort" :aria-label="`Сортировать: ${column.label}`" @click="emit('sort', column.key)"><span>{{ columnLabels[column.key] }}</span><ArrowUp v-if="props.sort.field === column.key && props.sort.direction === 'asc'" :size="12" aria-hidden="true" /><ArrowDown v-else-if="props.sort.field === column.key" :size="12" aria-hidden="true" /></button></th></tr></thead>
      <tbody>
        <tr v-for="item in rows" :key="item.id" class="registry-row" @click="emit('open', item.id)">
          <td><time class="registry-cell-date" :datetime="item.controlDate" :title="formatDate(item.controlDate)" :aria-label="formatDate(item.controlDate)"><span class="registry-date-full">{{ formatDate(item.controlDate) }}</span><span class="registry-date-short" aria-hidden="true">{{ formatDate(item.controlDate).slice(0, 5) }}</span></time></td>
          <td><span class="registry-cell-text" :title="item.incomingNumber">{{ item.incomingNumber || '—' }}</span></td>
          <td><span class="registry-cell-text registry-number" :title="item.instructionNumber">{{ item.instructionNumber }}</span></td>
          <td><button class="registry-record-link" type="button" @click.stop="emit('open', item.id)"><span class="registry-cell-text" :title="item.title">{{ item.title }}</span></button></td>
          <td><span class="registry-cell-summary" :title="item.summary">{{ item.summary || '—' }}</span></td>
          <td><time class="registry-cell-date registry-date" :datetime="item.deadline" :title="formatDate(item.deadline)" :aria-label="formatDate(item.deadline)"><span class="registry-date-full">{{ formatDate(item.deadline) }}</span><span class="registry-date-short" aria-hidden="true">{{ formatDate(item.deadline).slice(0, 5) }}</span></time><span class="registry-urgency" :class="`registry-tone-${item.urgency.tone}`" :title="item.urgency.label">{{ item.urgency.label }}</span></td>
          <td><span class="registry-cell-text" :title="item.executor">{{ item.executor }}</span></td>
          <td><span class="registry-status" :class="`registry-status-${item.status}`">{{ INSTRUCTION_STATUSES[item.status] }}</span><span v-if="item.executionMark" class="registry-cell-summary registry-mark" :title="item.executionMark">{{ item.executionMark }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
