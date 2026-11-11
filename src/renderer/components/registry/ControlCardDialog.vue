<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, useId, useTemplateRef } from 'vue';
import { Download, X } from 'lucide-vue-next';
import { CONTROL_CARD_FIELD_LIMITS, controlCardFields, normalizeControlCardFields } from '../../../shared/controlCard.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { registryService } from '../../services/RegistryService.js';
import { useAppStore } from '../../stores/appStore.js';

const groups = [
  { title: 'Реквизиты документа', fields: [
    { name: 'instructionNumber', label: 'Подписной номер' },
    { name: 'documentDate', label: 'Дата документа', type: 'date' },
    { name: 'incomingNumber', label: 'Входящий номер' },
    { name: 'incomingDate', label: 'Дата входящей регистрации', type: 'date' },
    { name: 'source', label: 'Откуда поступил документ' },
    { name: 'office', label: 'Канцелярия' },
    { name: 'officePhone', label: 'Телефон канцелярии', type: 'tel' },
  ] },
  { title: 'Содержание и срок исполнения', fields: [
    { name: 'title', label: 'Вид и краткое содержание СДМ', multiline: true },
    { name: 'summary', label: 'Резолюция', multiline: true },
    { name: 'deadline', label: 'Срок исполнения', type: 'date' },
    { name: 'extendedUntil', label: 'Продлён до', type: 'date' },
  ] },
  { title: 'Исполнитель', fields: [
    { name: 'executor', label: 'Исполнитель' },
    { name: 'department', label: 'Подразделение' },
    { name: 'executorPhone', label: 'Телефон исполнителя', type: 'tel' },
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
const dialog = useTemplateRef('dialog');
const titleId = useId();
const helpId = useId();
const defaults = controlCardFields(props.record);
const fields = reactive({ ...defaults });
const exporting = shallowRef(false);
const closing = shallowRef(false);
const error = shallowRef('');
const notice = shallowRef('');
const busy = computed(() => exporting.value || closing.value);
const motion = createDialogMotion(() => dialog.value);

async function save() {
  if (busy.value) return;
  exporting.value = true;
  notice.value = '';
  error.value = '';
  try {
    const request = { id: props.record.id, generation: props.generation, fields: normalizeControlCardFields(fields, defaults) };
    const result = await app.withOperation(() => registryService.exportControlCard(request));
    if (!result.cancelled) notice.value = 'Контрольная карточка сохранена.';
  } catch (cause) {
    error.value = errorMessage(cause, 'Не удалось сохранить контрольную карточку.');
  } finally {
    exporting.value = false;
  }
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
onBeforeUnmount(() => motion.dispose());
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
