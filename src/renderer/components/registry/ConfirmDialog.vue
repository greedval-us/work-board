<script setup>
import { nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef } from 'vue';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
const dialog = useTemplateRef('dialog');
const options = shallowRef({});
const choosing = shallowRef(false);
const motion = createDialogMotion(() => dialog.value);
const titleId = useId();
const messageId = useId();
let resolveChoice;
let previousFocus;
let disposed = false;

async function ask(value) {
  if (resolveChoice || disposed) return 'cancel';
  previousFocus = document.activeElement;
  options.value = value;
  const answer = new Promise((resolve) => { resolveChoice = resolve; });
  await nextTick();
  if (disposed || !resolveChoice) return answer;
  motion.open();
  dialog.value?.querySelector('[data-cancel]')?.focus();
  return answer;
}

async function choose(value) {
  if (choosing.value || !resolveChoice || disposed) return;
  choosing.value = true;
  const resolve = resolveChoice;
  const closed = await motion.close();
  if (disposed || resolveChoice !== resolve) return;
  choosing.value = false;
  if (!closed) return;
  resolveChoice = null;
  if (resolve && previousFocus?.isConnected) previousFocus.focus();
  resolve?.(value);
}

onBeforeUnmount(() => {
  disposed = true;
  motion.dispose();
  const resolve = resolveChoice;
  resolveChoice = null;
  resolve?.('cancel');
});
defineExpose({ ask });
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="registry-dialog registry-confirm-dialog" :aria-labelledby="titleId" :aria-describedby="messageId" :aria-busy="choosing" @cancel.prevent="choose('cancel')">
      <div class="registry-confirm-content"><h2 :id="titleId">{{ options.title }}</h2><p :id="messageId">{{ options.message }}</p></div>
      <div class="registry-dialog-actions registry-confirm-actions"><button type="button" class="registry-button" data-cancel :disabled="choosing" @click="choose('cancel')">{{ options.cancelLabel || 'Отмена' }}</button><button v-if="options.secondaryLabel" type="button" class="registry-button" :disabled="choosing" @click="choose('secondary')">{{ options.secondaryLabel }}</button><button type="button" class="registry-button" :class="options.danger ? 'registry-button-danger' : 'registry-button-primary'" :disabled="choosing" @click="choose('primary')">{{ options.primaryLabel }}</button></div>
    </dialog>
  </Teleport>
</template>
