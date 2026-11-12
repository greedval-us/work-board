<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { Download, X } from 'lucide-vue-next';
import { CONTROL_CARD_OPTION_LABELS } from '../../../shared/constants/settings.js';
import { CONTROL_CARD_FIELD_LIMITS, controlCardFields, executorContactFor } from '../../../shared/controlCard.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
import { useAppStore } from '../../stores/appStore.js';
import { useControlCardStore } from '../../stores/controlCardStore.js';

const groups = [
  { title: 'Реквизиты документа', fields: [
    { name: 'instructionNumber', label: 'Подписной номер' },
    { name: 'documentDate', label: 'Дата документа', type: 'date' },
    { name: 'incomingNumber', label: 'Входящий номер' },
    { name: 'incomingDate', label: 'Дата входящей регистрации', type: 'date' },
    { name: 'source', label: 'Откуда поступил документ' },
  ] },
  { title: 'Содержание и срок исполнения', fields: [
    { name: 'title', label: 'Вид и краткое содержание СДМ', multiline: true },
    { name: 'summary', label: 'Резолюция', multiline: true },
    { name: 'deadline', label: 'Срок исполнения', type: 'date' },
    { name: 'extendedUntil', label: 'Продлён до', type: 'date' },
  ] },
  { title: 'Исполнитель', fields: [
    { name: 'executor', label: 'Исполнитель' },
    { name: 'department', label: CONTROL_CARD_OPTION_LABELS.department },
    { name: 'executorPhone', label: CONTROL_CARD_OPTION_LABELS.executorPhone },
  ] },
  { title: 'Отметки', fields: [
    { name: 'executionMark', label: 'Отметка об исполнении', multiline: true },
    { name: 'removalMark', label: 'Отметка о снятии с контроля', multiline: true },
    { name: 'removalDate', label: 'Дата снятия с контроля', type: 'date' },
  ] },
];

const props = defineProps({ record: { type: Object, required: true }, generation: { type: Number, required: true } });
const emit = defineEmits(['close']);
const app = useAppStore();
const report = useControlCardStore();
const { exporting, error, notice } = storeToRefs(report);
report.reset();
const dialog = useTemplateRef('dialog');
const titleId = useId();
const helpId = useId();
const defaults = controlCardFields(props.record, app.executorContacts);
const fields = reactive({ ...defaults });
const closing = shallowRef(false);
const busy = computed(() => exporting.value || closing.value);
const motion = createDialogMotion(() => dialog.value);

watch(() => fields.executor.trim().toLowerCase(), (executor) => {
  Object.assign(fields, executorContactFor(executor, app.executorContacts));
});

async function save() {
  if (busy.value) return;
  await report.exportCard({ id: props.record.id, generation: props.generation, fields, defaults });
}

async function close() {
  if (busy.value) return;
  closing.value = true;
  if (await motion.close()) emit('close');
}

onMounted(() => {
  motion.open();
  dialog.value?.querySelector('[name="instructionNumber"]')?.focus();
});
onBeforeUnmount(() => { motion.dispose(); report.reset(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="registry-dialog registry-control-card-dialog" :aria-labelledby="titleId" :aria-describedby="helpId" @cancel.prevent="close">
      <header class="registry-dialog-header">
        <div><h2 :id="titleId">Контрольная карточка Ф‑21</h2><p :id="helpId" class="registry-help">Поля можно оставить пустыми. Изменения в этой форме действуют только для отчёта. Отметки промежуточного контроля берутся из сохранённого указания.</p></div>
        <button type="button" class="registry-button registry-close-button" aria-label="Закрыть форму Ф‑21" :disabled="busy" @click="close"><X :size="20" aria-hidden="true" /></button>
      </header>
      <form class="registry-control-card-form" :aria-busy="exporting" @submit.prevent="save">
        <div class="registry-dialog-body registry-control-card-body">
          <fieldset v-for="group in groups" :key="group.title" class="registry-control-card-group" :disabled="busy">
            <legend>{{ group.title }}</legend>
            <div class="registry-form-grid">
              <label v-for="field in group.fields" :key="field.name" class="registry-field" :class="{ 'registry-field-wide': field.multiline }">
                <span>{{ field.label }}</span>
                <textarea v-if="field.multiline" v-model="fields[field.name]" :name="field.name" :maxlength="CONTROL_CARD_FIELD_LIMITS[field.name]" rows="3" />
                <select v-else-if="Object.hasOwn(CONTROL_CARD_OPTION_LABELS, field.name)" v-model="fields[field.name]" :name="field.name">
                  <option value="">Не указано</option>
                  <option v-for="option in app.registryOptions[field.name]" :key="option" :value="option">{{ option }}</option>
                </select>
                <input v-else v-model="fields[field.name]" :name="field.name" :type="field.type || 'text'" :maxlength="field.type === 'date' ? undefined : CONTROL_CARD_FIELD_LIMITS[field.name]" />
              </label>
            </div>
          </fieldset>
        </div>
        <div class="registry-dialog-actions registry-control-card-actions">
          <p v-if="error" class="registry-control-card-error" role="alert">{{ error }}</p>
          <p v-else class="registry-control-card-notice" role="status">{{ notice }}</p>
          <button type="button" class="registry-button" :disabled="busy" @click="close">Закрыть</button>
          <button type="submit" class="registry-button registry-button-primary registry-control-card-save" :disabled="busy"><Download :size="16" aria-hidden="true" />{{ exporting ? 'Сохранение…' : 'Сохранить Word' }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>
