<script setup>
defineProps({ closed: Boolean, closedLabel: { type: String, required: true } });
const emit = defineEmits(['change']);
</script>

<template>
  <div class="control-scope-switch" role="group" aria-label="Состояние контроля">
    <button type="button" class="registry-inline-action" :aria-pressed="!closed" @click="emit('change', false)">На контроле</button>
    <button type="button" class="registry-inline-action" :aria-pressed="closed" @click="emit('change', true)">{{ closedLabel }}</button>
  </div>
</template>

