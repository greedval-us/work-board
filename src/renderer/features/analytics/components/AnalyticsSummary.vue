<script setup>
import { computed } from 'vue';
import { Layers, CircleCheck, Clock3, TriangleAlert } from 'lucide-vue-next';
const props = defineProps({ totals: { type: Object, required: true } });
const cards = computed(() => [
  { key: 'total', label: 'Всего контролей', value: props.totals.total, caption: 'итоговые и промежуточные', icon: Layers, tone: 'neutral' },
  { key: 'closed', label: 'Закрыто', value: props.totals.closed, caption: 'включая проверки с отметкой', icon: CircleCheck, tone: 'success' },
  { key: 'active', label: 'Активные', value: props.totals.active, caption: 'контроль открыт', icon: Clock3, tone: 'accent' },
  { key: 'overdue', label: 'Просрочено', value: props.totals.overdue, caption: 'из активных контролей', icon: TriangleAlert, tone: 'danger' },
]);
</script>
<template>
  <dl class="analytics-summary"><div v-for="card in cards" :key="card.key" class="analytics-metric" :class="`analytics-tone-${card.tone}`"><dt><span>{{ card.label }}</span><component :is="card.icon" :size="17" aria-hidden="true" /></dt><dd :data-metric="card.key">{{ card.value.toLocaleString('ru-RU') }}</dd><small>{{ card.caption }}</small></div></dl>
</template>
