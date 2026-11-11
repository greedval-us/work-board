<script setup>
import { nextTick, reactive, shallowRef } from 'vue';
import { Pencil, Trash2 } from 'lucide-vue-next';
import { REGISTRY_OPTION_LABELS, REGISTRY_OPTION_MAX_LENGTH } from '../../../shared/constants/settings.js';

const props = defineProps({
  options: { type: Object, required: true },
  ready: Boolean,
  disabled: Boolean,
  error: { type: String, default: '' },
  addOption: { type: Function, required: true },
  updateOption: { type: Function, required: true },
  removeOption: { type: Function, required: true },
});
const drafts = reactive({ source: '', executor: '', controlType: '' });
const edits = reactive(Object.fromEntries(Object.keys(REGISTRY_OPTION_LABELS).map(field => [field, new Map()])));
const errorTarget = shallowRef(null);

async function add(field, event) {
  const value = drafts[field].trim();
  if (props.disabled || !value) return;
  const form = event.currentTarget;
  errorTarget.value = { field };
  if (await props.addOption(field, value)) drafts[field] = '';
  await nextTick();
  if (form.isConnected && (document.activeElement === document.body || form.contains(document.activeElement))) {
    form.elements.namedItem('value')?.focus({ preventScroll: true });
  }
}

async function edit(field, option, event) {
  const row = event.currentTarget.closest('li');
  edits[field].set(option, { value: option });
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

function save(field, option, event) {
  const value = edits[field].get(option).value.trim();
  if (!value || value === option) return;
  return changeOption(field, option, event, () => props.updateOption(field, option, value));
}

function remove(field, option, event) {
  return changeOption(field, option, event, () => props.removeOption(field, option));
}
</script>

<template>
  <section class="settings-section" aria-labelledby="registry-options-title">
    <div class="section-heading">
      <h2 id="registry-options-title">Списки для реестра</h2>
      <p>{{ props.ready ? 'Управляйте вариантами для карточки указания. В сохранённых карточках видны ранее выбранные значения.' : 'Откройте или создайте базу данных, чтобы заполнить списки.' }}</p>
    </div>
    <div v-if="props.ready" class="registry-option-groups">
      <div v-for="(label, field) in REGISTRY_OPTION_LABELS" :key="field" class="registry-option-group">
        <form :data-registry-option="field" @submit.prevent="add(field, $event)">
          <label>
            <span>{{ label }}</span>
            <input v-model="drafts[field]" name="value" type="text" :maxlength="REGISTRY_OPTION_MAX_LENGTH" :disabled="props.disabled" placeholder="Новое значение" required />
          </label>
          <button type="submit" :aria-label="`Добавить значение в список «${label}»`" :disabled="props.disabled || !drafts[field].trim()">Добавить</button>
        </form>
        <p v-if="props.error && errorTarget?.field === field && !errorTarget.option" class="registry-option-error" role="alert">{{ props.error }}</p>
        <ul v-if="props.options[field].length" :aria-label="label">
          <li v-for="option in props.options[field]" :key="option" :data-registry-option-value="option">
            <form v-if="edits[field].has(option)" class="registry-option-edit" @submit.prevent="save(field, option, $event)">
              <input v-model="edits[field].get(option).value" name="value" type="text" :aria-label="`Новое значение для «${option}»`"
                :maxlength="REGISTRY_OPTION_MAX_LENGTH" :disabled="props.disabled" required />
              <button type="submit" :disabled="props.disabled || !edits[field].get(option).value.trim() || edits[field].get(option).value.trim() === option">Сохранить</button>
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
.registry-option-group input, .registry-option-group button { min-height: 40px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--text); font-size: 12px; }
.registry-option-group input { width: 100%; min-width: 0; font-weight: 400; }
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
.registry-option-error { flex-basis: 100%; margin: 4px 0; color: var(--error); font-size: 12px; overflow-wrap: anywhere; }
</style>
