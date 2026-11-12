<script setup>
import { nextTick, reactive, shallowRef, watch } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { CONTROL_CARD_OPTION_LABELS, REGISTRY_OPTION_LABELS, REGISTRY_OPTION_LIMITS } from '../../../shared/constants/settings.js';
import { executorContactFor } from '../../../shared/controlCard.js';

const props = defineProps({
  options: { type: Object, required: true },
  executorContacts: { type: Array, required: true },
  ready: Boolean,
  disabled: Boolean,
  error: { type: String, default: '' },
  addOption: { type: Function, required: true },
  updateOption: { type: Function, required: true },
  removeOption: { type: Function, required: true },
});
const fields = Object.keys(REGISTRY_OPTION_LABELS);
const contactFields = Object.keys(CONTROL_CARD_OPTION_LABELS);
const drafts = reactive(Object.fromEntries(fields.map(field => [field, ''])));
const addContact = reactive(executorContactFor(''));
const edits = reactive(Object.fromEntries(fields.map(field => [field, new Map()])));
const errorTarget = shallowRef(null);

watch([() => props.options, () => props.executorContacts], ([options, contacts], [, previousContacts]) => {
  for (const field of contactFields) {
    if (addContact[field] && !options[field].includes(addContact[field])) addContact[field] = '';
  }
  for (const [executor, draft] of edits.executor) {
    if (!options.executor.includes(executor)) {
      edits.executor.delete(executor);
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

async function add(field, event) {
  const value = drafts[field].trim();
  if (props.disabled || !value) return;
  const form = event.currentTarget;
  errorTarget.value = { field };
  const contact = field === 'executor' ? { ...addContact } : undefined;
  if (await props.addOption(field, value, contact)) {
    drafts[field] = '';
    if (contact) Object.assign(addContact, executorContactFor(''));
  }
  await nextTick();
  if (form.isConnected && (document.activeElement === document.body || form.contains(document.activeElement))) {
    form.elements.namedItem('value')?.focus({ preventScroll: true });
  }
}

async function edit(field, option, event) {
  const row = event.currentTarget.closest('li');
  const draft = { value: option };
  if (field === 'executor') draft.contact = executorContactFor(option, props.executorContacts);
  edits[field].set(option, draft);
  await nextTick();
  const input = row.querySelector('input');
  input?.focus();
  input?.select();
}

async function cancel(field, option, event) {
  const row = event.currentTarget.closest('li');
  edits[field].delete(option);
  if (errorTarget.value?.field === field && errorTarget.value.option === option) errorTarget.value = null;
  await nextTick();
  row.querySelector('[data-option-action="edit"]')?.focus();
}

async function changeOption(field, option, event, operation) {
  if (props.disabled) return;
  const trigger = event.currentTarget;
  const row = trigger.closest('li');
  const list = row.parentElement;
  const group = list.parentElement;
  const index = [...list.children].indexOf(row);
  errorTarget.value = { field, option };
  const changed = await operation();
  if (changed) edits[field].delete(option);
  await nextTick();
  if (!group.isConnected || document.activeElement !== document.body) return;
  if (!changed && trigger.matches('button')) {
    trigger.focus();
    return;
  }
  const nextRow = list.isConnected ? list.children[index] ?? list.lastElementChild : null;
  (nextRow?.querySelector('input, button') ?? group.querySelector('input'))?.focus();
}

function canSave(field, option) {
  const draft = edits[field].get(option);
  const value = draft.value.trim();
  if (!value) return false;
  if (value !== option) return true;
  if (field !== 'executor') return false;
  const saved = executorContactFor(option, props.executorContacts);
  return contactFields.some(field => draft.contact[field] !== saved[field]);
}

function save(field, option, event) {
  if (!canSave(field, option)) return;
  const draft = edits[field].get(option);
  const contact = draft.contact ? { ...draft.contact } : undefined;
  return changeOption(field, option, event, () => props.updateOption(field, option, draft.value.trim(), contact));
}

function remove(field, option, event) {
  return changeOption(field, option, event, () => props.removeOption(field, option));
}
</script>

<template>
  <section class="settings-section" aria-labelledby="registry-options-title">
    <div class="section-heading">
      <h2 id="registry-options-title">Списки для реестра и Ф‑21</h2>
      <p>{{ props.ready ? 'Управляйте вариантами для карточки указания и отчёта Ф‑21. В сохранённых указаниях видны ранее выбранные значения.' : 'Откройте или создайте базу данных, чтобы заполнить списки.' }}</p>
    </div>
    <div v-if="props.ready" class="registry-option-groups">
      <div v-for="(label, field) in REGISTRY_OPTION_LABELS" :key="field" class="registry-option-group">
        <form :data-registry-option="field" @submit.prevent="add(field, $event)">
          <label>
            <span>{{ label }}</span>
            <input v-model="drafts[field]" name="value" type="text" :maxlength="REGISTRY_OPTION_LIMITS[field]" :disabled="props.disabled" placeholder="Новое значение" required />
          </label>
          <template v-if="field === 'executor'">
            <label v-for="(contactLabel, contactField) in CONTROL_CARD_OPTION_LABELS" :key="contactField">
              <span>{{ contactLabel }}</span>
              <select v-model="addContact[contactField]" :name="contactField" :disabled="props.disabled">
                <option value="">Не указано</option>
                <option v-for="choice in props.options[contactField]" :key="choice" :value="choice">{{ choice }}</option>
              </select>
            </label>
          </template>
          <button type="submit" :aria-label="`Добавить значение в список «${label}»`" :disabled="props.disabled || !drafts[field].trim()">Добавить</button>
        </form>
        <p v-if="props.error && errorTarget?.field === field && !errorTarget.option" class="registry-option-error" role="alert">{{ props.error }}</p>
        <ul v-if="props.options[field].length" :aria-label="label">
          <li v-for="option in props.options[field]" :key="option" :data-registry-option-value="option">
            <form v-if="edits[field].has(option)" class="registry-option-edit" @submit.prevent="save(field, option, $event)">
              <input v-model="edits[field].get(option).value" name="value" type="text" :aria-label="`Новое значение для «${option}»`"
                :maxlength="REGISTRY_OPTION_LIMITS[field]" :disabled="props.disabled" required />
              <template v-if="field === 'executor'">
                <label v-for="(contactLabel, contactField) in CONTROL_CARD_OPTION_LABELS" :key="contactField">
                  <span>{{ contactLabel }}</span>
                  <select v-model="edits[field].get(option).contact[contactField]" :name="contactField" :disabled="props.disabled">
                    <option value="">Не указано</option>
                    <option v-for="choice in props.options[contactField]" :key="choice" :value="choice">{{ choice }}</option>
                  </select>
                </label>
              </template>
              <button type="submit" :disabled="props.disabled || !canSave(field, option)">Сохранить</button>
              <button type="button" data-option-action="cancel" :disabled="props.disabled" @click="cancel(field, option, $event)">Отмена</button>
            </form>
            <template v-else>
              <span class="registry-option-value">{{ option }}</span>
              <button class="registry-option-action" type="button" data-option-action="edit" title="Редактировать" :aria-label="`Редактировать «${option}»`"
                :disabled="props.disabled" @click="edit(field, option, $event)"><Pencil :size="15" aria-hidden="true" /></button>
              <button class="registry-option-action registry-option-remove" type="button" data-option-action="remove" title="Удалить" :aria-label="`Удалить «${option}»`"
                :disabled="props.disabled" @click="remove(field, option, $event)"><Trash2 :size="15" aria-hidden="true" /></button>
            </template>
            <p v-if="props.error && errorTarget?.field === field && errorTarget.option === option" class="registry-option-error" role="alert">{{ props.error }}</p>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.registry-option-groups { display: grid; gap: 14px; }
.registry-option-group form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.registry-option-group label { display: grid; flex: 1 1 175px; gap: 6px; min-width: 0; max-width: 420px; font-size: 12px; font-weight: 550; }
.registry-option-group input, .registry-option-group select, .registry-option-group button { min-height: 40px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--text); font-size: 12px; }
.registry-option-group input, .registry-option-group select { width: 100%; min-width: 0; font-weight: 400; }
.registry-option-group input::placeholder { color: var(--muted); }
.registry-option-group button { font-weight: 550; }
.registry-option-group button:enabled:hover { background: var(--raised); }
.registry-option-group ul { display: grid; gap: 4px; max-width: 550px; margin: 8px 0 0; padding: 0; list-style: none; }
.registry-option-group li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; padding: 4px 6px 4px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); font-size: 12px; }
.registry-option-value { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.registry-option-group .registry-option-action { display: grid; flex: 0 0 34px; min-height: 34px; place-items: center; padding: 0; border-color: transparent; border-radius: 8px; color: var(--muted); }
.registry-option-group .registry-option-remove:enabled:hover { background: var(--error-surface); color: var(--error); }
.registry-option-group .registry-option-edit { flex: 1; min-width: 0; }
.registry-option-edit input { flex: 1 1 150px; }
.registry-option-edit label { flex-basis: 150px; }
.registry-option-error { flex-basis: 100%; margin: 4px 0; color: var(--error); font-size: 12px; overflow-wrap: anywhere; }
</style>
