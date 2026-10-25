<script setup>
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
const props = defineProps({ page: { type: Number, required: true }, pageSize: { type: Number, required: true }, pageCount: { type: Number, required: true }, total: { type: Number, required: true }, disabled: Boolean });
const emit = defineEmits(['page', 'pageSize']);
const range = computed(() => props.total ? `${(props.page - 1) * props.pageSize + 1}–${Math.min(props.page * props.pageSize, props.total)} из ${props.total}` : 'Найдено записей: 0');
</script>
<template>
  <nav class="registry-pagination" aria-label="Страницы реестра">
    <p class="registry-result-count" aria-live="polite">{{ range }}</p>
    <div class="registry-pagination-controls">
      <label class="registry-page-size"><span>На странице</span><select :value="props.pageSize" :disabled="props.disabled" @change="emit('pageSize', Number($event.target.value))"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>
      <div class="registry-page-buttons"><button class="registry-button registry-page-button" type="button" aria-label="Предыдущая страница" :disabled="props.disabled || props.page <= 1" @click="emit('page', props.page - 1)"><ChevronLeft :size="17" aria-hidden="true" /></button><span aria-label="Текущая страница">{{ props.page }} / {{ props.pageCount }}</span><button class="registry-button registry-page-button" type="button" aria-label="Следующая страница" :disabled="props.disabled || props.page >= props.pageCount" @click="emit('page', props.page + 1)"><ChevronRight :size="17" aria-hidden="true" /></button></div>
    </div>
  </nav>
</template>
