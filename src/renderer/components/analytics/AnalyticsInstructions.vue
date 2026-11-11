<script setup>
import { useId, useTemplateRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { formatDate, instructionDeadline, INSTRUCTION_STATUSES } from '../../../shared/registry.js';

const props = defineProps({ result: { type: Object, required: true }, loading: Boolean });
const emit = defineEmits(['page']);
const headingId = useId();
const scroller = useTemplateRef('scroller');

watch(() => props.result.page, () => { if (scroller.value) scroller.value.scrollTop = 0; }, { flush: 'post' });
</script>

<template>
  <section class="analytics-chart-card analytics-instructions" :aria-labelledby="headingId">
    <header><h2 :id="headingId">Указания исполнителя</h2></header>
    <div ref="scroller" class="analytics-table-scroll" role="region" :aria-labelledby="headingId" :aria-busy="loading" tabindex="0">
      <table class="analytics-data-table analytics-instructions-table" :aria-labelledby="headingId">
        <thead><tr><th scope="col">Подписной номер</th><th scope="col">Название указания</th><th scope="col">Действующий срок</th><th scope="col">Статус</th></tr></thead>
        <tbody>
          <tr v-for="item in result.items" :key="item.id" :data-instruction-id="item.id">
            <td>{{ item.instructionNumber }}</td>
            <th scope="row"><RouterLink class="analytics-instruction-link" :to="{ name: 'Registry', query: { instruction: item.id } }">{{ item.title }}</RouterLink></th>
            <td><time :datetime="instructionDeadline(item)">{{ formatDate(instructionDeadline(item)) }}</time></td>
            <td>{{ INSTRUCTION_STATUSES[item.status] }}</td>
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
