<script setup>
import { computed, nextTick, reactive, shallowRef, watch } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import ExecutorContactFields from './ExecutorContactFields.vue';
import { CONTROL_CARD_OPTION_LABELS, REGISTRY_OPTION_LABELS, REGISTRY_OPTION_LIMITS } from '../../../shared/constants/settings.js';
import { executorContactFor } from '../../../shared/controlCard.js';

const props = defineProps({
  field: { type: String, required: true },
  options: { type: Object, required: true },
  executorContacts: { type: Array, required: true },
  disabled: Boolean,
  error: { type: String, default: '' },
  addOption: { type: Function, required: true },
  updateOption: { type: Function, required: true },
  removeOption: { type: Function, required: true },
});
const emit = defineEmits(['operation']);
const newValue = shallowRef('');
const edits = reactive(new Map());
const errorOption = shallowRef(null);
const contactFields = Object.keys(CONTROL_CARD_OPTION_LABELS);
const addContact = reactive(executorContactFor(''));
const isExecutor = computed(() => props.field === 'executor');
const executorDetails = computed(() => new Map(props.executorContacts.map(({ executor, department, executorPhone }) => [
  executor, [department, executorPhone].filter(Boolean).join(' · '),
])));

watch([() => props.options, () => props.executorContacts], ([options, contacts], [, previousContacts]) => {
  if (!isExecutor.value) return;
  for (const field of contactFields) {
    if (addContact[field] && !options[field].includes(addContact[field])) addContact[field] = '';
  }
  for (const [executor, draft] of edits) {
    if (!options.executor.includes(executor)) {
      edits.delete(executor);
      continue;
    }
    const previous = executorContactFor(executor, previousContacts);
    const saved = executorContactFor(executor, contacts);
    for (const field of contactFields) {
      const selected = draft.contact[field];
      if (selected === previous[field] || (selected && !options[field].includes(selected))) draft.contact[field] = saved[field];
    }
  }
});

async function add(event) {
  const value = newValue.value.trim();
  if (props.disabled || !value) return;
  const form = event.currentTarget;
  emit('operation');
  errorOption.value = '';
  const contact = isExecutor.value ? { ...addContact } : undefined;
  if (await props.addOption(props.field, value, contact)) {
    newValue.value = '';
    if (contact) Object.assign(addContact, executorContactFor(''));
  }
  await nextTick();
  if (form.isConnected && (document.activeElement === document.body || form.contains(document.activeElement))) {
    form.elements.namedItem('value')?.focus({ preventScroll: true });
  }
}

async function edit(option, event) {
  const row = event.currentTarget.closest('li');
  const draft = { value: option };
  if (isExecutor.value) draft.contact = executorContactFor(option, props.executorContacts);
  edits.set(option, draft);
  await nextTick();
  const input = row.querySelector('input');
  input?.focus();
  input?.select();
}

async function cancel(option, event) {
  const row = event.currentTarget.closest('li');
  edits.delete(option);
  if (errorOption.value === option) errorOption.value = null;
  await nextTick();
  row.querySelector('[data-option-action="edit"]')?.focus();
}

async function changeOption(option, event, operation) {
  if (props.disabled) return;
  const trigger = event.currentTarget;
  const row = trigger.closest('li');
  const list = row.parentElement;
  const group = list.parentElement;
  const index = [...list.children].indexOf(row);
  emit('operation');
  errorOption.value = option;
  const changed = await operation();
  if (changed) edits.delete(option);
  await nextTick();
  if (!group.isConnected || document.activeElement !== document.body) return;
  if (!changed && trigger.matches('button')) {
    trigger.focus();
    return;
  }
  const nextRow = list.isConnected ? list.children[index] ?? list.lastElementChild : null;
  (nextRow?.querySelector('input, button') ?? group.querySelector('input'))?.focus();
}

function canSave(option) {
  const draft = edits.get(option);
  const value = draft.value.trim();
  if (!value) return false;
  if (value !== option) return true;
  if (!isExecutor.value) return false;
  const saved = executorContactFor(option, props.executorContacts);
  return contactFields.some(field => draft.contact[field] !== saved[field]);
}

function save(option, event) {
  if (!canSave(option)) return;
  const draft = edits.get(option);
  const contact = draft.contact ? { ...draft.contact } : undefined;
  return changeOption(option, event, () => props.updateOption(props.field, option, draft.value.trim(), contact));
}

function remove(option, event) {
  return changeOption(option, event, () => props.removeOption(props.field, option));
}
</script>

<template>
  <div class="registry-option-group" :class="{ 'registry-office-group': field === 'office', 'registry-executor-group': isExecutor }">
    <div v-if="field === 'office'" class="registry-default-office"><slot /></div>
    <slot v-else />
    <form :data-registry-option="field" @submit.prevent="add">
      <label>
        <span>{{ field === 'office' ? 'Новый участок' : REGISTRY_OPTION_LABELS[field] }}</span>
        <input v-model="newValue" name="value" type="text" :maxlength="REGISTRY_OPTION_LIMITS[field]" :disabled="props.disabled" placeholder="Новое значение" required />
      </label>
      <ExecutorContactFields v-if="isExecutor" :contact="addContact" :options="props.options" :disabled="props.disabled"
        @change="(key, value) => addContact[key] = value" />
      <button type="submit" :aria-label="`Добавить значение в список «${REGISTRY_OPTION_LABELS[field]}»`" :disabled="props.disabled || !newValue.trim()">Добавить</button>
    </form>
    <p v-if="props.error && errorOption === ''" class="registry-option-error" role="alert">{{ props.error }}</p>
    <ul v-if="props.options[field].length" :aria-label="REGISTRY_OPTION_LABELS[field]">
      <li v-for="option in props.options[field]" :key="option" :data-registry-option-value="option">
        <form v-if="edits.has(option)" class="registry-option-edit" @submit.prevent="save(option, $event)">
          <input v-model="edits.get(option).value" name="value" type="text" :aria-label="`Новое значение для «${option}»`"
            :maxlength="REGISTRY_OPTION_LIMITS[field]" :disabled="props.disabled" required />
          <ExecutorContactFields v-if="isExecutor" :contact="edits.get(option).contact" :options="props.options" :disabled="props.disabled"
            @change="(key, value) => edits.get(option).contact[key] = value" />
          <button type="submit" :disabled="props.disabled || !canSave(option)">Сохранить</button>
          <button type="button" data-option-action="cancel" :disabled="props.disabled" @click="cancel(option, $event)">Отмена</button>
        </form>
        <template v-else>
          <span class="registry-option-value">
            <span>{{ option }}</span>
            <span v-if="isExecutor && executorDetails.has(option)" class="registry-option-contact">{{ executorDetails.get(option) }}</span>
          </span>
          <button class="registry-option-action" type="button" data-option-action="edit" title="Редактировать" :aria-label="`Редактировать «${option}»`"
            :disabled="props.disabled" @click="edit(option, $event)"><Pencil :size="15" aria-hidden="true" /></button>
          <button class="registry-option-action registry-option-remove" type="button" data-option-action="remove" title="Удалить" :aria-label="`Удалить «${option}»`"
            :disabled="props.disabled" @click="remove(option, $event)"><Trash2 :size="15" aria-hidden="true" /></button>
        </template>
        <p v-if="props.error && errorOption === option" class="registry-option-error" role="alert">{{ props.error }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.registry-option-group { min-width: 0; }
.registry-office-group { display: grid; align-items: start; gap: 8px 14px; }
.registry-executor-group { grid-column: 1 / -1; }
.registry-option-group :deep(.registry-settings-help) { margin-top: 4px; color: var(--muted); font-size: calc(11px + var(--app-font-offset)); line-height: 1.45; }
.registry-option-group :deep(form) { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px; }
.registry-option-group :deep(label) { display: grid; flex: 1 1 108px; gap: 4px; min-width: 0; font-size: calc(12px + var(--app-font-offset)); font-weight: 550; }
.registry-executor-group :deep(label) { flex-basis: 130px; }
.registry-option-group input, .registry-option-group :deep(select), .registry-option-group :deep(button) { min-height: 32px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--grouped); color: var(--text); font-size: calc(12px + var(--app-font-offset)); }
.registry-option-group input, .registry-option-group :deep(select) { width: 100%; min-width: 0; font-weight: 400; }
.registry-option-group input::placeholder { color: var(--muted); }
.registry-option-group :deep(button) { background: var(--panel); font-weight: 550; }
.registry-option-group :deep(button:enabled:hover) { background: var(--raised); }
.registry-option-group ul { display: grid; margin: 6px 0 0; padding: 0 5px; border-radius: 8px; background: var(--grouped); list-style: none; }
.registry-option-group li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; padding: 2px 0 2px 4px; font-size: calc(12px + var(--app-font-offset)); }
.registry-option-group li + li { border-top: 1px solid var(--border); }
.registry-option-value { display: flex; flex: 1; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; overflow-wrap: anywhere; }
.registry-option-contact { color: var(--muted); font-size: calc(11px + var(--app-font-offset)); }
.registry-option-group .registry-option-action { display: grid; flex: 0 0 28px; min-height: 28px; place-items: center; padding: 0; border-color: transparent; border-radius: 7px; color: var(--muted); background: transparent; }
.registry-option-group .registry-option-remove:enabled:hover { background: var(--error-surface); color: var(--error); }
.registry-option-group .registry-option-edit { flex: 1; min-width: 0; }
.registry-option-edit input { flex: 1 1 150px; }
.registry-option-edit :deep(label) { flex-basis: 150px; }
.registry-option-group :deep(.registry-option-error) { flex-basis: 100%; margin: 4px 0; color: var(--error); font-size: calc(12px + var(--app-font-offset)); overflow-wrap: anywhere; }
.registry-option-group :deep(.registry-option-notice) { margin-top: 4px; color: var(--accent); font-size: calc(12px + var(--app-font-offset)); }
.registry-option-group :deep(.registry-option-notice:empty) { margin-top: 0; }

@container dictionaries (min-width: 425px) {
  .registry-office-group { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .registry-default-office { grid-column: 1; grid-row: 1 / span 2; }
  .registry-office-group > form, .registry-office-group > p, .registry-office-group > ul { grid-column: 2; }
  .registry-office-group ul { margin-top: 0; }
}

.registry-option-group :focus-visible { outline-offset: 0; }
@media (prefers-reduced-motion: no-preference) {
  .registry-option-group { animation: directory-appear 160ms var(--motion-ease-out); }
  @keyframes directory-appear { from { opacity: .4; transform: translateY(2px); } to { opacity: 1; transform: none; } }
}
</style>
