<script setup>
import { onErrorCaptured, ref, watch } from 'vue';
import { useErrorStore } from '../../stores/errorStore.js';

const errors = useErrorStore();
const props = defineProps({ resetKey: { type: String, default: '' } });
const failed = ref(false);
const revision = ref(0);
onErrorCaptured((cause, _instance, context) => {
  console.error('Workspace error:', context, cause);
  errors.report(cause);
  // Replacing a live subtree would discard dialogs and their unsaved guards.
  // Other failures can be reported while keeping the current workspace mounted.
  if (context === 'render function' || context === 'https://vuejs.org/error-reference/#runtime-1') {
    failed.value = true;
  }
  return false;
});
function retry() {
  failed.value = false;
  revision.value++;
  errors.dismiss();
}
watch(() => props.resetKey, () => { failed.value = false; });
</script>

<template>
  <div v-if="failed" class="workspace-recovery" role="alert">
    <h2>Не удалось показать раздел</h2>
    <p>Попробуйте открыть его ещё раз.</p>
    <button type="button" class="primary-button" @click="retry">Повторить</button>
  </div>
  <slot v-else :key="revision" />
</template>

<style scoped>
.workspace-recovery { margin: auto; padding: 24px; text-align: center; }
.workspace-recovery h2 { font-size: 20px; font-weight: 600; }
.workspace-recovery p { margin: 12px 0 20px; color: var(--muted); }
</style>
