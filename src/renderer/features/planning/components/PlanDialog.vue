<script setup>
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { PLAN_ACTIVITY_LIMIT } from '../../../../shared/planning.js';
import ControlRecordDialog from '../../control/ControlRecordDialog.vue';
import ControlRecordFields from '../../control/ControlRecordFields.vue';
import { recordDialogProps } from '../../control/recordDialogProps.js';
import { createPlanDraft, snapshotPlan } from '../planDraft.js';

const props = defineProps(recordDialogProps);
const emit = defineEmits(['close']);
const surface = useTemplateRef('surface');
const rowList = useTemplateRef('rowList');
const fields = useTemplateRef('fields');
const rows = ref([{ key: 0, draft: createPlanDraft(props.record) }]);
let nextKey = 1;
const initialValue = JSON.stringify(rows.value[0].draft);
const initialSchedule = JSON.stringify(rows.value[0].draft.controlSchedule);
const dirty = computed(() => rows.value.length !== 1 || JSON.stringify(rows.value[0].draft) !== initialValue);

function focusItem(index) {
  rowList.value?.children[index]?.querySelector('[name="planItem"]')?.focus();
}

async function appendRow() {
  rows.value.push({ key: nextKey++, draft: createPlanDraft() });
  await nextTick();
  focusItem(rows.value.length - 1);
}

async function removeRow(index) {
  if (index === 0) rows.value[1].draft = snapshotPlan(rows.value[1].draft, rows.value[0].draft);
  rows.value.splice(index, 1);
  await nextTick();
  focusItem(Math.min(index, rows.value.length - 1));
}

function save() {
  const data = rows.value.map(row => snapshotPlan(row.draft, rows.value[0].draft));
  if (props.record.id && JSON.stringify(data[0].controlSchedule) === initialSchedule) delete data[0].controlSchedule;
  return props.saveRecord(data);
}

defineExpose({
  dirty,
  requestClose: () => surface.value.requestClose(),
  enterSurface: () => surface.value.enterSurface(),
  leaveSurface: () => surface.value.leaveSurface(),
});
</script>

<template>
  <ControlRecordDialog ref="surface" v-bind="props" :dirty="dirty" :save-record="save"
    dialog-class="planning-dialog" body-class="planning-dialog-body" :title="record.id ? 'Карточка плана' : 'Новый план'"
    delete-title="Удалить строку плана?" :delete-message="`Строка с подписным номером ${record.instructionNumber} будет удалена из планирования.`"
    :focus-checkpoint="() => fields?.[0]?.focusSelectedDate()" @close="emit('close')">
    <template #toolbar="{ disabled }">
      <button v-if="!record.id" type="button" class="registry-button" :disabled="disabled" @click="appendRow">
        <Plus :size="16" aria-hidden="true" />Добавить строку
      </button>
    </template>
    <template #default="{ disabled, errorId }">
      <div ref="rowList" class="planning-rows">
        <section v-for="(row, index) in rows" :key="row.key" class="planning-row" :aria-label="`Строка ${index + 1}`">
          <div v-if="rows.length > 1" class="planning-row-heading">
            <h3>Строка {{ index + 1 }}</h3>
            <button type="button" class="registry-button registry-close-button" :aria-label="`Убрать строку ${index + 1}`"
              title="Убрать строку" :disabled="disabled" @click="removeRow(index)"><X :size="15" aria-hidden="true" /></button>
          </div>
          <ControlRecordFields ref="fields" v-model="row.draft" :record="record" title-label="Название плана"
            :show-document-details="index === 0" :error-id="errorId" :disabled="disabled" :closed="Boolean(record.closedAt)" :selected-checkpoint="selectedCheckpoint">
            <template #before-execution-mark>
              <label class="registry-field registry-field-wide">
                <span>Мероприятие</span><textarea v-model="row.draft.activity" name="activity" rows="2" :maxlength="PLAN_ACTIVITY_LIMIT" />
              </label>
            </template>
            <template #execution-start>
              <label class="registry-field registry-field-wide">
                <span>Пункт плана</span><input v-model="row.draft.planItem" name="planItem" type="text" maxlength="500" />
              </label>
            </template>
          </ControlRecordFields>
        </section>
      </div>
    </template>
  </ControlRecordDialog>
</template>

<style scoped>
.planning-row + .planning-row { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.planning-row-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.planning-row-heading h3 { margin: 0; color: var(--muted); font-size: calc(13px + var(--app-font-offset)); }
</style>
