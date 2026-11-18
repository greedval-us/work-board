<script setup>
import { shallowRef } from 'vue';
import RegistryOptionGroup from './RegistryOptionGroup.vue';
import ControlCardOfficeSetting from './ControlCardOfficeSetting.vue';

const props = defineProps({
  options: { type: Object, required: true },
  executorContacts: { type: Array, required: true },
  office: { type: String, default: '' },
  officeError: { type: String, default: '' },
  ready: Boolean,
  disabled: Boolean,
  error: { type: String, default: '' },
  saveOffice: { type: Function, required: true },
  addOption: { type: Function, required: true },
  updateOption: { type: Function, required: true },
  removeOption: { type: Function, required: true },
});
const fields = ['office', 'source', 'documentType', 'department', 'executorPhone', 'executor'];
const errorField = shallowRef(null);
</script>

<template>
  <section class="settings-section" aria-labelledby="registry-options-title">
    <div class="section-heading">
      <h2 id="registry-options-title">Реестр и Ф‑21</h2>
      <p v-if="!props.ready">Откройте или создайте базу данных, чтобы заполнить настройки.</p>
    </div>
    <div v-if="props.ready" class="registry-option-groups">
      <RegistryOptionGroup v-for="field in fields" :key="field" :field="field" :options="props.options"
        :executor-contacts="props.executorContacts" :disabled="props.disabled" :error="errorField === field ? props.error : ''"
        :add-option="props.addOption" :update-option="props.updateOption" :remove-option="props.removeOption" @operation="errorField = field">
        <ControlCardOfficeSetting v-if="field === 'office'" :office="props.office" :options="props.options.office"
          :error="props.officeError" :disabled="props.disabled" :save-office="props.saveOffice" />
        <div v-else-if="field === 'executor'" class="registry-executor-heading">
          <h3>Исполнители</h3>
          <p class="registry-settings-help">Подразделение и телефон для Ф‑21 можно указать при добавлении или редактировании исполнителя.</p>
        </div>
      </RegistryOptionGroup>
    </div>
  </section>
</template>

<style scoped>
.registry-option-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); align-items: start; gap: 14px; }
.registry-executor-heading { margin-bottom: 10px; }
.registry-executor-heading h3 { margin: 0; font-size: calc(13px + var(--app-font-offset)); font-weight: 650; }
</style>
