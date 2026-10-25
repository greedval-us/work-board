<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-vue-next';
import { INSTRUCTION_STATUSES } from '../../../shared/registry.js';

const props = defineProps({ filters: { type: Object, required: true }, appliedFilters: { type: Object, required: true }, disabled: Boolean, changed: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['update', 'apply', 'reset']);
const filterbar = useTemplateRef('filterbar');
const toggle = useTemplateRef('toggle');
const panel = useTemplateRef('panel');
const panelId = useId();
const titleId = useId();
const expanded = shallowRef(false);
const panelStyle = shallowRef({});
let restoreFocus = false;

const shortDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8)}.${value.slice(5, 7)}` : value;
const appliedConditions = computed(() => {
  const filters = props.appliedFilters;
  const conditions = [];
  if (filters.instructionNumber) conditions.push({ key: 'number', label: `№ ${filters.instructionNumber}`, detail: `Номер указания: ${filters.instructionNumber}` });
  if (filters.deadlineFrom || filters.deadlineTo) conditions.push({ key: 'deadline',
    label: filters.deadlineFrom && filters.deadlineTo ? `${shortDate(filters.deadlineFrom)}–${shortDate(filters.deadlineTo)}` : `${filters.deadlineFrom ? 'с' : 'по'} ${shortDate(filters.deadlineFrom || filters.deadlineTo)}`,
    detail: `Срок исполнения: ${filters.deadlineFrom || 'без начала'} — ${filters.deadlineTo || 'без окончания'}, включительно` });
  if (filters.executor) conditions.push({ key: 'executor', label: filters.executor, detail: `Исполнитель: ${filters.executor}` });
  if (filters.status) conditions.push({ key: 'status', label: INSTRUCTION_STATUSES[filters.status], detail: `Статус: ${INSTRUCTION_STATUSES[filters.status]}` });
  if (filters.executionMark) conditions.push({ key: 'mark', label: filters.executionMark, detail: `Отметка об исполнении: ${filters.executionMark}` });
  return conditions;
});
const summary = computed(() => appliedConditions.value.map((condition) => condition.detail).join('; ') || 'Все указания');
const update = (field, event) => emit('update', { field, value: event.target.value });

function positionPanel() {
  const bounds = filterbar.value?.getBoundingClientRect();
  if (!bounds) return;
  const width = Math.min(720, window.innerWidth - 32);
  const top = Math.max(16, Math.min(bounds.bottom + 8, window.innerHeight - 220));
  panelStyle.value = { width: `${width}px`, left: `${Math.max(16, Math.min(bounds.left, window.innerWidth - width - 16))}px`,
    top: `${top}px`, maxHeight: `${window.innerHeight - top - 16}px` };
}

function beforeToggle(event) {
  if (event.newState === 'open') positionPanel();
  else restoreFocus = panel.value?.contains(document.activeElement);
}

async function afterToggle(event) {
  expanded.value = event.newState === 'open';
  if (expanded.value) { await nextTick(); panel.value?.querySelector('input')?.focus({ preventScroll: true }); }
  else if (restoreFocus || document.activeElement === document.body) toggle.value?.focus({ preventScroll: true });
}

function closePanel() { panel.value?.hidePopover(); toggle.value?.focus({ preventScroll: true }); }
function apply() {
  emit('apply');
  if (!props.filters.deadlineFrom || !props.filters.deadlineTo || props.filters.deadlineFrom <= props.filters.deadlineTo) closePanel();
}
function reset() { emit('reset'); closePanel(); }
function resize() { if (expanded.value) positionPanel(); }
onMounted(() => window.addEventListener('resize', resize));
onBeforeUnmount(() => window.removeEventListener('resize', resize));
</script>

<template>
  <div ref="filterbar" class="registry-filter-container">
    <div class="registry-filterbar">
      <button ref="toggle" type="button" class="registry-button registry-filter-toggle" :class="{ 'registry-filter-toggle-active': appliedConditions.length }" :popovertarget="panelId" :aria-controls="panelId" :aria-expanded="expanded" :disabled="props.disabled"><SlidersHorizontal :size="15" aria-hidden="true" />Фильтры<span v-if="appliedConditions.length" class="registry-filter-count">{{ appliedConditions.length }}</span></button>
      <div class="registry-filter-summary" :aria-label="`Применено: ${summary}`" :title="summary">
        <span v-if="!appliedConditions.length" class="registry-filter-all">Все указания</span>
        <span v-for="condition in appliedConditions" :key="condition.key" class="registry-filter-chip" :title="condition.detail">{{ condition.label }}</span>
      </div>
      <span v-if="props.changed" class="registry-draft-label" title="Изменения фильтров ещё не применены"><span class="registry-draft-dot" aria-hidden="true" /><span>Не применено</span></span>
      <button v-if="appliedConditions.length || props.changed" type="button" class="registry-button registry-filter-reset" :disabled="props.disabled" aria-label="Сбросить фильтры" title="Сбросить фильтры" @click="reset"><RotateCcw :size="15" aria-hidden="true" /></button>
    </div>
    <div :id="panelId" ref="panel" popover="auto" class="registry-filters registry-filter-panel" :style="panelStyle" :aria-labelledby="titleId" @beforetoggle="beforeToggle" @toggle="afterToggle" @keydown.esc.prevent.stop="closePanel">
      <form aria-label="Фильтры реестра" @submit.prevent="apply">
        <div class="registry-filter-panel-heading"><h2 :id="titleId">Фильтры</h2><button type="button" class="registry-button registry-filter-close" aria-label="Закрыть фильтры" @click="closePanel"><X :size="17" aria-hidden="true" /></button></div>
        <fieldset class="registry-filter-fields" :disabled="props.disabled">
          <label class="registry-field"><span>Номер указания</span><input :value="props.filters.instructionNumber" data-filter="instructionNumber" type="search" maxlength="200" placeholder="Часть номера" @input="update('instructionNumber', $event)" /></label>
          <label class="registry-field"><span>Срок исполнения с</span><input :value="props.filters.deadlineFrom" data-filter="deadlineFrom" type="date" @input="update('deadlineFrom', $event)" /></label>
          <label class="registry-field"><span>Срок исполнения по</span><input :value="props.filters.deadlineTo" data-filter="deadlineTo" type="date" :min="props.filters.deadlineFrom || undefined" @input="update('deadlineTo', $event)" /></label>
          <label class="registry-field"><span>Исполнитель</span><input :value="props.filters.executor" data-filter="executor" type="search" maxlength="200" placeholder="Имя или фамилия" @input="update('executor', $event)" /></label>
          <label class="registry-field"><span>Статус исполнения</span><select :value="props.filters.status" data-filter="status" @change="update('status', $event)"><option value="">Все статусы</option><option v-for="(label, value) in INSTRUCTION_STATUSES" :key="value" :value="value">{{ label }}</option></select></label>
          <label class="registry-field"><span>Отметка об исполнении</span><input :value="props.filters.executionMark" data-filter="executionMark" type="search" maxlength="500" placeholder="Текст комментария" @input="update('executionMark', $event)" /></label>
        </fieldset>
        <div class="registry-filter-footer"><p v-if="props.error" class="registry-inline-error" role="alert">{{ props.error }}</p><p v-else class="registry-help">Все условия — одновременно. Даты включительно.</p><div class="registry-actions"><button class="registry-button" type="button" :disabled="props.disabled" @click="reset">Сбросить</button><button class="registry-button registry-button-primary" type="submit" :disabled="props.disabled">Применить</button></div></div>
      </form>
    </div>
  </div>
</template>
