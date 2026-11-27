<script setup>
import { ArrowUpRight } from 'lucide-vue-next';

defineProps({
  item: { type: Object, required: true },
  to: { type: Object, required: true },
  checkpoint: Boolean,
  planLabel: { type: String, default: '' },
});
</script>

<template>
  <RouterLink class="calendar-instruction-card" :class="{ 'calendar-checkpoint-card': checkpoint, 'calendar-plan-card': planLabel }" :to="to">
    <span class="calendar-record-number" :title="`Подписной номер ${item.instructionNumber}`">№ {{ item.instructionNumber }} <ArrowUpRight :size="15" aria-hidden="true" /></span>
    <span v-if="planLabel" class="calendar-plan-label">{{ planLabel }}<template v-if="item.planItem"> · {{ item.planItem }}</template></span>
    <strong :title="item.title">{{ item.title }}</strong>
    <span v-if="planLabel && item.activity" class="calendar-record-secondary calendar-plan-activity" :title="item.activity">Мероприятие: {{ item.activity }}</span>
    <span class="calendar-record-secondary" :title="item.executor">{{ item.executor }}</span>
    <span class="calendar-record-meta">
      <span class="calendar-badge" :class="`calendar-tone-${item.urgency.tone}`">{{ item.urgency.label }}</span>
      <span v-if="checkpoint && !item.scheduled">Вне текущего графика</span>
      <span v-else-if="item.secondaryLabel">{{ item.secondaryLabel }}</span>
    </span>
    <span v-if="checkpoint && item.mark" class="calendar-record-secondary calendar-checkpoint-mark" :title="item.mark">{{ item.mark }}</span>
  </RouterLink>
</template>
