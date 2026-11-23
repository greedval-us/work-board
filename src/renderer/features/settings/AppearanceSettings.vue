<script setup>
import { Check, Contrast } from 'lucide-vue-next';
import { APP_FONT_FAMILIES, APP_FONT_SIZE_LIMITS } from '../../../shared/constants/settings.js';

const props = defineProps({
  theme: { type: String, required: true },
  typography: { type: Object, required: true },
  typographyError: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['change', 'change-typography']);
const options = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Системная' },
];
const fontSizes = Array.from(
  { length: APP_FONT_SIZE_LIMITS.max - APP_FONT_SIZE_LIMITS.min + 1 },
  (_, index) => APP_FONT_SIZE_LIMITS.min + index,
);

function changeTypography(key, input) {
  const value = key === 'fontSize' ? Number(input.value) : input.value;
  if (value === props.typography[key]) return;
  input.value = props.typography[key];
  emit('change-typography', { ...props.typography, [key]: value });
}
</script>

<template>
  <section class="settings-section appearance-settings" aria-labelledby="appearance-title">
    <div class="section-heading">
      <span class="settings-glyph"><Contrast :size="17" aria-hidden="true" /></span>
      <h2 id="appearance-title">Оформление</h2>
    </div>
    <fieldset class="theme-options" :disabled="disabled">
      <legend class="sr-only">Тема оформления</legend>
      <button v-for="option in options" :key="option.value" type="button" :value="option.value"
        class="theme-option" :class="{ 'theme-option-selected': theme === option.value }"
        :aria-pressed="theme === option.value" @click="$emit('change', option.value)">
        <span class="appearance-preview" :class="`appearance-preview-${option.value}`" aria-hidden="true">
          <span class="preview-toolbar"><i /><i /><i /></span>
          <span class="preview-sidebar"><i /><i /><i /></span>
          <span class="preview-content"><i /><i /><i /></span>
        </span>
        <span class="theme-option-caption">
          <span>{{ option.label }}</span>
          <span v-if="theme === option.value" class="theme-check" aria-hidden="true">
            <Check :size="11" :stroke-width="3" />
          </span>
        </span>
      </button>
    </fieldset>
    <fieldset class="typography-options" :disabled="disabled">
      <legend class="sr-only">Шрифт интерфейса</legend>
      <label class="typography-option">
        <span>Шрифт</span>
        <select name="appearance-font-family" :value="typography.fontFamily" @change="changeTypography('fontFamily', $event.target)">
          <option v-for="(label, family) in APP_FONT_FAMILIES" :key="family" :value="family">{{ label }}</option>
        </select>
      </label>
      <label class="typography-option">
        <span>Размер текста</span>
        <select name="appearance-font-size" :value="typography.fontSize" @change="changeTypography('fontSize', $event.target)">
          <option v-for="size in fontSizes" :key="size" :value="size">{{ size }} пкс</option>
        </select>
      </label>
    </fieldset>
    <p v-if="typographyError" class="typography-error" role="alert">{{ typographyError }}</p>
  </section>
</template>

<style scoped>
.typography-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; min-width: 0; margin: 12px 0 0; padding: 0; border: 0; }
.typography-option { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: calc(12px + var(--app-font-offset)); }
.typography-option select { width: 100%; min-width: 0; min-height: 32px; padding: 4px 7px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); background: var(--grouped); font: inherit; }
.typography-error { margin: 8px 0 0; color: var(--error); }
</style>
