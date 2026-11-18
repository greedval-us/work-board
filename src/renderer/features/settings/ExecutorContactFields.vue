<script setup>
import { CONTROL_CARD_OPTION_LABELS } from '../../../shared/constants/settings.js';

const props = defineProps({
  contact: { type: Object, required: true },
  options: { type: Object, required: true },
  disabled: Boolean,
});
const emit = defineEmits(['change']);
</script>

<template>
  <label v-for="(label, field) in CONTROL_CARD_OPTION_LABELS" :key="field">
    <span>{{ label }}</span>
    <select :value="props.contact[field]" :name="field" :disabled="props.disabled" @change="emit('change', field, $event.target.value)">
      <option value="">Не указано</option>
      <option v-for="choice in props.options[field]" :key="choice" :value="choice">{{ choice }}</option>
    </select>
  </label>
</template>
