<script setup>
import { shallowRef } from 'vue';
import { BookOpen } from 'lucide-vue-next';
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
const registryFields = ['office', 'source', 'documentType'];
const executorFields = ['department', 'executorPhone', 'executor'];
const directoryNames = {
  office: 'Участки делопроизводства',
  source: 'Источники документов',
  documentType: 'Виды документов',
  department: 'Подразделения',
  executorPhone: 'Телефоны исполнителей',
  executor: 'Исполнители',
};
const directory = shallowRef('office');
const errorField = shallowRef(null);
</script>

<template>
  <section class="settings-section registry-options-section" aria-labelledby="registry-options-title">
    <div class="section-heading">
      <span class="settings-glyph"><BookOpen :size="17" aria-hidden="true" /></span>
      <h2 id="registry-options-title">Справочники</h2>
    </div>
    <p v-if="!props.ready" class="settings-unavailable">Откройте или создайте базу данных, чтобы заполнить справочники.</p>
    <template v-if="props.ready">
      <label class="registry-directory-choice">
        <span>Справочник</span>
        <select v-model="directory" name="registry-directory" :disabled="props.disabled">
          <optgroup label="Документы">
            <option v-for="field in registryFields" :key="field" :value="field">{{ directoryNames[field] }}</option>
          </optgroup>
          <optgroup label="Исполнители">
            <option v-for="field in executorFields" :key="field" :value="field">{{ directoryNames[field] }}</option>
          </optgroup>
        </select>
      </label>
      <div class="registry-options-scroll" role="region" :aria-label="directoryNames[directory]" tabindex="0">
        <RegistryOptionGroup v-for="field in registryFields" v-show="directory === field" :key="field" :field="field" :options="props.options"
          :executor-contacts="props.executorContacts" :disabled="props.disabled" :error="errorField === field ? props.error : ''"
          :add-option="props.addOption" :update-option="props.updateOption" :remove-option="props.removeOption" @operation="errorField = field">
          <ControlCardOfficeSetting v-if="field === 'office'" :office="props.office" :options="props.options.office"
            :error="props.officeError" :disabled="props.disabled" :save-office="props.saveOffice" />
        </RegistryOptionGroup>
        <section v-show="executorFields.includes(directory)" aria-labelledby="registry-executors-title" aria-describedby="registry-executors-help">
          <h3 id="registry-executors-title" class="sr-only">Исполнители</h3>
          <RegistryOptionGroup v-for="field in executorFields" v-show="directory === field" :key="field" :field="field" :options="props.options"
            :executor-contacts="props.executorContacts" :disabled="props.disabled" :error="errorField === field ? props.error : ''"
            :add-option="props.addOption" :update-option="props.updateOption" :remove-option="props.removeOption" @operation="errorField = field" />
          <p id="registry-executors-help">Подразделение и телефон используются в карточке Ф‑21.</p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.registry-options-section { display: flex; flex-direction: column; min-height: 0; max-height: 100%; container: dictionaries / inline-size; }
.registry-options-section .section-heading { flex: none; }
.registry-directory-choice { display: flex; align-items: center; flex: none; gap: 10px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: calc(12px + var(--app-font-offset)); }
.registry-directory-choice select { flex: 1; min-width: 0; min-height: 32px; padding: 4px 7px; border: 1px solid var(--border); border-radius: 8px; background: var(--grouped); color: var(--text); }
.registry-options-scroll { min-height: 0; overflow: auto; margin: -2px; padding: 2px; scrollbar-width: thin; }
.registry-options-scroll:focus-visible { outline-offset: -2px; }
.settings-unavailable { max-width: 46ch; color: var(--muted); font-size: calc(12px + var(--app-font-offset)); }
#registry-executors-help { margin-top: 8px; color: var(--muted); font-size: calc(11px + var(--app-font-offset)); }
</style>
