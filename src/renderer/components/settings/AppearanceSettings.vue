<script setup>
import { Sun, Moon, Check } from 'lucide-vue-next';
import { APP_FONT_FAMILIES, APP_FONT_SIZE_LIMITS } from '../../../shared/constants/settings.js';

const props = defineProps({
  theme: { type: String, required: true },
  typography: { type: Object, required: true },
  typographyError: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['change', 'change-typography']);
const options = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
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
  <section class="settings-section" aria-labelledby="appearance-title">
    <div class="section-heading">
      <h2 id="appearance-title">Оформление</h2>
      <p>Настройте тему, шрифт и размер текста.</p>
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
          <component :is="option.icon" :size="16" aria-hidden="true" />
          <span>{{ option.label }}</span>
          <span class="theme-check" aria-hidden="true">
            <Check v-if="theme === option.value" :size="12" :stroke-width="3" />
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
.typography-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; max-width: 382px; margin: 16px 0 0; padding: 0; border: 0; }
.typography-option { display: grid; gap: 6px; min-width: 0; color: var(--muted); }
.typography-option select { width: 100%; min-width: 0; min-height: 38px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 9px; color: var(--text); background: var(--panel); font: inherit; }
.typography-error { margin: 8px 0 0; color: var(--error); }
</style>
