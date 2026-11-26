<script setup>
import { useId, useTemplateRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { vResizableColumns } from '../../../ui/resizableColumns.js';
import { formatDate, instructionDeadline } from '../../../../shared/registry.js';
import { registryLocation } from '../../registry/registryLocation.js';
import { planningLocation } from '../../planning/planningLocation.js';

const props = defineProps({ result: { type: Object, required: true }, loading: Boolean, planning: Boolean });
const emit = defineEmits(['page']);
const headingId = useId();
const scroller = useTemplateRef('scroller');

function controlDate(item) { return item.checkpointDate ?? instructionDeadline(item); }

function controlRoute(item) {
  const query = props.planning ? { plan: item.id } : { instruction: item.id };
  if (item.checkpointDate) query.checkpoint = item.checkpointDate;
  const location = props.planning ? planningLocation : registryLocation;
  return location(Boolean(item.closedAt), query);
}

watch(() => props.result.page, () => { if (scroller.value) scroller.value.scrollTop = 0; }, { flush: 'post' });
</script>

<template>
  <section class="analytics-chart-card analytics-instructions" :aria-labelledby="headingId">
    <header><h2 :id="headingId">Контроль исполнителя</h2></header>
    <div ref="scroller" class="analytics-table-scroll" role="region" :aria-labelledby="headingId" :aria-busy="loading" tabindex="0">
      <table v-resizable-columns="planning ? 'analytics-plan-records' : 'analytics-records'" class="analytics-data-table analytics-instructions-table" :aria-labelledby="headingId">
        <thead><tr><th scope="col">Подписной номер</th><th v-if="planning" scope="col">Пункт плана</th><th scope="col">{{ planning ? 'Название плана' : 'Название указания' }}</th><th scope="col">Дата контроля</th></tr></thead>
        <tbody>
          <tr v-for="item in result.items" :key="`${item.id}:${item.checkpointDate ?? 'final'}`" :data-instruction-id="planning ? undefined : item.id" :data-plan-id="planning ? item.id : undefined" :data-checkpoint-date="item.checkpointDate">
            <td>{{ item.instructionNumber }}</td>
            <td v-if="planning">{{ item.planItem || '—' }}</td>
            <th scope="row">
              <RouterLink class="analytics-instruction-link" :to="controlRoute(item)">{{ item.title }}</RouterLink>
              <small v-if="item.checkpointDate" class="analytics-checkpoint-caption">Промежуточный контроль{{ item.checkpointClosed ? ' · Есть отметка' : '' }}</small>
              <small v-else-if="item.closedAt" class="analytics-control-closed">Контроль закрыт</small>
            </th>
            <td><time :datetime="controlDate(item)">{{ formatDate(controlDate(item)) }}</time></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="result.pageCount > 1" class="analytics-instructions-pagination">
      <span role="status">Страница {{ result.page }} из {{ result.pageCount }}</span>
      <button class="analytics-button" type="button" data-instructions-page="previous" :disabled="loading || result.page === 1" @click="emit('page', result.page - 1)">Назад</button>
      <button class="analytics-button" type="button" data-instructions-page="next" :disabled="loading || result.page === result.pageCount" @click="emit('page', result.page + 1)">Далее</button>
    </div>
  </section>
</template>
