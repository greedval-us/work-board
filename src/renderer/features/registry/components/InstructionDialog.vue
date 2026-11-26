<script setup>
import { computed, nextTick, ref, shallowRef, useTemplateRef } from 'vue';
import { FileText } from 'lucide-vue-next';
import { useAppStore } from '../../../app/appStore.js';
import ControlRecordDialog from '../../control/ControlRecordDialog.vue';
import ControlRecordFields from '../../control/ControlRecordFields.vue';
import { recordDialogProps } from '../../control/recordDialogProps.js';
import { createInstructionDraft, snapshotInstruction } from '../instructionDraft.js';
import ControlCardDialog from './ControlCardDialog.vue';

const props = defineProps(recordDialogProps);
const emit = defineEmits(['close']);
const surface = useTemplateRef('surface');
const fields = useTemplateRef('fields');
const reportButton = useTemplateRef('reportButton');
const form = ref(createInstructionDraft(props.record));
const initialValue = JSON.stringify(form.value);
const initialSchedule = JSON.stringify(form.value.controlSchedule);
const dirty = computed(() => JSON.stringify(form.value) !== initialValue);
const reportOpen = shallowRef(false);
const app = useAppStore();
const generation = app.database?.generation;

function save() {
  const data = snapshotInstruction(form.value);
  if (JSON.stringify(data.controlSchedule) === initialSchedule) delete data.controlSchedule;
  return props.saveRecord(data);
}

async function closeReport() {
  reportOpen.value = false;
  await nextTick();
  reportButton.value?.focus();
}

defineExpose({
  dirty,
  requestClose: () => surface.value.requestClose(),
  enterSurface: () => surface.value.enterSurface(),
  leaveSurface: () => surface.value.leaveSurface(),
});
</script>

<template>
  <ControlRecordDialog ref="surface" v-bind="props" :dirty="dirty" :blocked="reportOpen" :save-record="save"
    :title="record.id ? 'Карточка указания' : 'Новое указание'" delete-title="Удалить указание?"
    :delete-message="`Указание с подписным номером ${record.instructionNumber} будет удалено из реестра и календаря.`"
    :focus-checkpoint="() => fields?.focusSelectedDate()" @close="emit('close')">
    <template #default="{ disabled, errorId }">
      <ControlRecordFields ref="fields" v-model="form" :record="record" title-label="Название указания"
        :disabled="disabled" :error-id="errorId" :closed="Boolean(record.closedAt)" :selected-checkpoint="selectedCheckpoint" />
    </template>
    <template #actions="{ disabled }">
      <span v-if="record.id" :title="dirty ? 'Сохраните изменения и снова откройте карточку.' : undefined">
        <button ref="reportButton" type="button" class="registry-button registry-control-card-open"
          :disabled="disabled || dirty" @click="reportOpen = true"><FileText :size="16" aria-hidden="true" />Ф‑21 в Word</button>
      </span>
    </template>
  </ControlRecordDialog>
  <ControlCardDialog v-if="reportOpen" :record="record" :generation="generation" @close="closeReport" />
</template>
