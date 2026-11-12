<script setup>
import { computed, nextTick, reactive, shallowRef, useTemplateRef, watch } from 'vue';
import { CONTROL_CARD_OPTION_LABELS, INSTRUCTION_OPTION_LABELS } from '../../../shared/constants/settings.js';
import { executorContactFor } from '../../../shared/controlCard.js';

const props = defineProps({
  options: { type: Object, required: true },
  contacts: { type: Array, required: true },
  disabled: Boolean,
  error: { type: String, default: '' },
  saveContact: { type: Function, required: true },
});
const executor = shallowRef('');
const executorInput = useTemplateRef('executorInput');
const contactFields = Object.keys(CONTROL_CARD_OPTION_LABELS);
const draft = reactive({ department: '', executorPhone: '' });
const savedContact = computed(() => executorContactFor(executor.value, props.contacts));
const changed = computed(() => Boolean(executor.value) && contactFields.some(field => draft[field] !== savedContact.value[field]));
const notice = shallowRef('');
const showError = shallowRef(false);

watch([executor, () => savedContact.value.department, () => savedContact.value.executorPhone], () => {
  Object.assign(draft, savedContact.value);
});
watch(() => props.options, (options) => {
  if (!options.executor.includes(executor.value)) executor.value = '';
  for (const field of contactFields) {
    if (!options[field].includes(draft[field])) draft[field] = '';
  }
});
watch([executor, () => draft.department, () => draft.executorPhone], () => {
  notice.value = '';
  showError.value = false;
});

async function save() {
  if (props.disabled || !changed.value) return;
  notice.value = '';
  showError.value = false;
  const saved = await props.saveContact(executor.value, { ...draft });
  if (saved) notice.value = 'Контакты сохранены.';
  else showError.value = true;
  await nextTick();
  if (document.activeElement === document.body) executorInput.value?.focus({ preventScroll: true });
}
</script>

<template>
  <section class="settings-section" aria-labelledby="executor-contacts-title">
    <div class="section-heading">
      <h2 id="executor-contacts-title">Контакты исполнителей</h2>
      <p>Сохранённые подразделение и телефон подставляются в Ф‑21. Чтобы убрать привязку, выберите «Не указано» в обоих полях и сохраните.</p>
    </div>
    <p v-if="!props.options.executor.length" class="contact-help">Добавьте исполнителей в списке выше.</p>
    <form data-executor-contacts @submit.prevent="save">
      <fieldset class="contact-fields" :disabled="props.disabled">
        <label>
          <span>{{ INSTRUCTION_OPTION_LABELS.executor }}</span>
          <select ref="executorInput" v-model="executor" name="executor" required>
            <option value="">Выберите исполнителя</option>
            <option v-for="option in props.options.executor" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <label v-for="(label, field) in CONTROL_CARD_OPTION_LABELS" :key="field">
          <span>{{ label }}</span>
          <select v-model="draft[field]" :name="field" :disabled="!executor">
            <option value="">Не указано</option>
            <option v-for="option in props.options[field]" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <button type="submit" :disabled="!changed">Сохранить</button>
      </fieldset>
      <p v-if="showError && props.error" class="contact-error" role="alert">{{ props.error }}</p>
      <p v-else class="contact-status" role="status">{{ notice }}</p>
    </form>
  </section>
</template>

<style scoped>
.contact-fields { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
.contact-fields label { display: grid; flex: 1 1 150px; gap: 6px; min-width: 0; font-size: 12px; font-weight: 550; }
.contact-fields select, .contact-fields button { min-height: 40px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--text); font-size: 12px; }
.contact-fields select { width: 100%; min-width: 0; font-weight: 400; }
.contact-fields button { font-weight: 550; }
.contact-fields button:enabled:hover { background: var(--raised); }
.contact-help, .contact-status, .contact-error { margin: 8px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.contact-help { margin: 0 0 8px; }
.contact-status:empty { margin: 0; }
.contact-error { color: var(--error); }
</style>
