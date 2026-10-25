<script setup>
import { Sun, Moon, Check } from 'lucide-vue-next';

defineProps({ theme: { type: String, required: true }, disabled: { type: Boolean, default: false } });
defineEmits(['change']);
const options = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
];
</script>

<template>
  <section class="settings-section" aria-labelledby="appearance-title">
    <div class="section-heading">
      <h2 id="appearance-title">Оформление</h2>
      <p>Выберите удобную тему. Выбор сохранится на этом устройстве.</p>
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
  </section>
</template>
