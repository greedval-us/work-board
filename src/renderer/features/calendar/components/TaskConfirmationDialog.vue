<script setup>
import { nextTick, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue';
import { createDialogMotion } from '../../../ui/dialogMotion.js';

defineProps({
  title: { type: String, required: true },
  series: Boolean,
  busy: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(['cancel', 'discard', 'save', 'remove']);
const dialog = useTemplateRef('dialog');
const motion = createDialogMotion(() => dialog.value);
const mode = shallowRef('unsaved');
const closing = shallowRef(false);
let intent = 0;

async function open(nextMode) {
  const request = ++intent;
  mode.value = nextMode;
  await nextTick();
  if (request !== intent) return false;
  return motion.open();
}

async function close() {
  intent += 1;
  if (!dialog.value?.open) return true;
  closing.value = true;
  try { return await motion.close(); }
  finally { closing.value = false; }
}

onBeforeUnmount(() => {
  intent += 1;
  motion.dispose();
});
defineExpose({ open, close, closing });
</script>

<template>
  <dialog ref="dialog" class="calendar-confirm-dialog" aria-labelledby="calendar-confirm-title" aria-describedby="calendar-confirm-description" @cancel.prevent="emit('cancel')">
    <template v-if="mode === 'delete'">
      <h2 id="calendar-confirm-title">{{ series ? 'Удалить всю серию?' : 'Удалить задачу?' }}</h2>
      <p id="calendar-confirm-description">{{ series ? `Все повторы задачи «${title}» будут удалены.` : `«${title}» будет удалена из базы данных.` }}</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="disabled" autofocus @click="emit('cancel')">Отмена</button><button class="calendar-button calendar-button-danger" :disabled="disabled" @click="emit('remove')">{{ busy ? 'Удаление…' : 'Удалить' }}</button></div>
    </template>
    <template v-else>
      <h2 id="calendar-confirm-title">Сохранить изменения?</h2><p id="calendar-confirm-description">В задаче есть несохранённые изменения. Выберите, как продолжить.</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="disabled" autofocus @click="emit('cancel')">Продолжить редактирование</button><button class="calendar-button" :disabled="disabled" @click="emit('discard')">Не сохранять</button><button class="calendar-button calendar-button-primary" :disabled="disabled" @click="emit('save')">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div>
    </template>
  </dialog>
</template>
