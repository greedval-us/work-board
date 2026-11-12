<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef } from 'vue';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-vue-next';
import { CHECKPOINT_FILTER_LABELS, INSTRUCTION_STATUSES } from '../../../shared/registry.js';
import { REGISTRY_FILTER_LIMITS } from '../../constants/inputLimits.js';

const FILTER_POPOVER = Object.freeze({ MAX_WIDTH: 720, VIEWPORT_MARGIN: 16, ANCHOR_GAP: 8, MIN_VISIBLE_HEIGHT: 220 });

const props = defineProps({ filters: { type: Object, required: true }, appliedFilters: { type: Object, required: true }, disabled: Boolean, changed: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['update', 'apply', 'reset']);
const filterbar = useTemplateRef('filterbar');
const toggle = useTemplateRef('toggle');
const panel = useTemplateRef('panel');
const panelId = useId();
const titleId = useId();
const expanded = shallowRef(false);
const panelStyle = shallowRef({});
const nativePopover = typeof HTMLElement.prototype.showPopover === 'function';
let restoreFocus = false;

const shortDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8)}.${value.slice(5, 7)}` : value;
const appliedConditions = computed(() => {
  const filters = props.appliedFilters;
  const conditions = [];
  if (filters.instructionNumber) conditions.push({ key: 'number', label: `№ ${filters.instructionNumber}`, detail: `Подписной номер: ${filters.instructionNumber}` });
  if (filters.deadlineFrom || filters.deadlineTo) conditions.push({ key: 'deadline',
    label: filters.deadlineFrom && filters.deadlineTo ? `${shortDate(filters.deadlineFrom)}–${shortDate(filters.deadlineTo)}` : `${filters.deadlineFrom ? 'с' : 'по'} ${shortDate(filters.deadlineFrom || filters.deadlineTo)}`,
    detail: `Действующий срок: ${filters.deadlineFrom || 'без начала'} — ${filters.deadlineTo || 'без окончания'}, включительно` });
  if (filters.executor) conditions.push({ key: 'executor', label: filters.executor, detail: `Исполнитель: ${filters.executor}` });
  if (filters.status) conditions.push({ key: 'status', label: INSTRUCTION_STATUSES[filters.status], detail: `Статус: ${INSTRUCTION_STATUSES[filters.status]}` });
  if (filters.checkpoint) conditions.push({ key: 'checkpoint', label: CHECKPOINT_FILTER_LABELS[filters.checkpoint],
    detail: `Промежуточный контроль · ${CHECKPOINT_FILTER_LABELS[filters.checkpoint]}` });
  if (filters.executionMark) conditions.push({ key: 'mark', label: filters.executionMark, detail: `Отметка об исполнении: ${filters.executionMark}` });
  return conditions;
});
const summary = computed(() => appliedConditions.value.map((condition) => condition.detail).join('; ') || 'Все указания');
const update = (field, event) => emit('update', { field, value: event.target.value });

function positionPanel() {
  const bounds = filterbar.value?.getBoundingClientRect();
  if (!bounds) return;
  const width = Math.min(FILTER_POPOVER.MAX_WIDTH, window.innerWidth - FILTER_POPOVER.VIEWPORT_MARGIN * 2);
  const top = Math.max(FILTER_POPOVER.VIEWPORT_MARGIN, Math.min(bounds.bottom + FILTER_POPOVER.ANCHOR_GAP, window.innerHeight - FILTER_POPOVER.MIN_VISIBLE_HEIGHT));
  panelStyle.value = { width: `${width}px`, left: `${Math.max(FILTER_POPOVER.VIEWPORT_MARGIN, Math.min(bounds.left, window.innerWidth - width - FILTER_POPOVER.VIEWPORT_MARGIN))}px`,
    top: `${top}px`, maxHeight: `${window.innerHeight - top - FILTER_POPOVER.VIEWPORT_MARGIN}px` };
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

function closePanel() {
  if (nativePopover) panel.value?.hidePopover();
  else { beforeToggle({ newState: 'closed' }); void afterToggle({ newState: 'closed' }); }
  toggle.value?.focus({ preventScroll: true });
}
function toggleFallback() {
  if (nativePopover) return;
  if (expanded.value) closePanel();
  else { beforeToggle({ newState: 'open' }); void afterToggle({ newState: 'open' }); }
}
function dismissFallback(event) {
  if (!nativePopover && expanded.value && !panel.value?.contains(event.target) && !toggle.value?.contains(event.target)) {
    // Clicking another control must keep focus on that control.
    expanded.value = false;
  }
}
function apply() {
  emit('apply');
  if (!props.filters.deadlineFrom || !props.filters.deadlineTo || props.filters.deadlineFrom <= props.filters.deadlineTo) closePanel();
}
function reset() { emit('reset'); closePanel(); }
function resize() { if (expanded.value) positionPanel(); }
onMounted(() => {
  window.addEventListener('resize', resize);
  if (!nativePopover) document.addEventListener('pointerdown', dismissFallback);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  if (!nativePopover) document.removeEventListener('pointerdown', dismissFallback);
});
</script>

<template>
  <div ref="filterbar" class="registry-filter-container">
    <div class="registry-filterbar">
      <button ref="toggle" type="button" class="registry-button registry-filter-toggle" :class="{ 'registry-filter-toggle-active': appliedConditions.length }" :popovertarget="nativePopover ? panelId : undefined" :aria-controls="panelId" :aria-expanded="expanded" :disabled="props.disabled" @click="toggleFallback"><SlidersHorizontal :size="15" aria-hidden="true" />Фильтры<span v-if="appliedConditions.length" class="registry-filter-count">{{ appliedConditions.length }}</span></button>
      <div class="registry-filter-summary" :aria-label="`Применено: ${summary}`" :title="summary">
        <span v-if="!appliedConditions.length" class="registry-filter-all">Все указания</span>
        <span v-for="condition in appliedConditions" :key="condition.key" class="registry-filter-chip" :title="condition.detail">{{ condition.label }}</span>
      </div>
      <span v-if="props.changed" class="registry-draft-label" title="Изменения фильтров ещё не применены"><span class="registry-draft-dot" aria-hidden="true" /><span>Не применено</span></span>
      <button v-if="appliedConditions.length || props.changed" type="button" class="registry-button registry-filter-reset" :disabled="props.disabled" aria-label="Сбросить фильтры" title="Сбросить фильтры" @click="reset"><RotateCcw :size="15" aria-hidden="true" /></button>
    </div>
    <Teleport to="body" :disabled="nativePopover">
    <div :id="panelId" ref="panel" :popover="nativePopover ? 'auto' : undefined" :data-open="expanded" :data-fallback="nativePopover ? undefined : true" :hidden="!nativePopover && !expanded" class="registry-filters registry-filter-panel" :style="panelStyle" :aria-labelledby="titleId" @beforetoggle="beforeToggle" @toggle="afterToggle" @keydown.esc.prevent.stop="closePanel">
      <form aria-label="Фильтры реестра" @submit.prevent="apply">
        <div class="registry-filter-panel-heading"><h2 :id="titleId">Фильтры</h2><button type="button" class="registry-button registry-filter-close" aria-label="Закрыть фильтры" @click="closePanel"><X :size="17" aria-hidden="true" /></button></div>
        <fieldset class="registry-filter-fields" :disabled="props.disabled">
          <label class="registry-field"><span>Подписной номер</span><input :value="props.filters.instructionNumber" data-filter="instructionNumber" type="search" :maxlength="REGISTRY_FILTER_LIMITS.instructionNumber" placeholder="Часть номера" @input="update('instructionNumber', $event)" /></label>
          <label class="registry-field"><span>Действующий срок с</span><input :value="props.filters.deadlineFrom" data-filter="deadlineFrom" type="date" @input="update('deadlineFrom', $event)" /></label>
          <label class="registry-field"><span>Действующий срок по</span><input :value="props.filters.deadlineTo" data-filter="deadlineTo" type="date" :min="props.filters.deadlineFrom || undefined" @input="update('deadlineTo', $event)" /></label>
          <label class="registry-field"><span>Исполнитель</span><input :value="props.filters.executor" data-filter="executor" type="search" :maxlength="REGISTRY_FILTER_LIMITS.executor" placeholder="Имя или фамилия" @input="update('executor', $event)" /></label>
          <label class="registry-field"><span>Статус исполнения</span><select :value="props.filters.status" data-filter="status" @change="update('status', $event)"><option value="">Все статусы</option><option v-for="(label, value) in INSTRUCTION_STATUSES" :key="value" :value="value">{{ label }}</option></select></label>
          <label class="registry-field"><span>Промежуточный контроль</span><select :value="props.filters.checkpoint" data-filter="checkpoint" @change="update('checkpoint', $event)"><option value="">Все указания</option><option v-for="(label, value) in CHECKPOINT_FILTER_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
          <label class="registry-field registry-field-wide"><span>Отметка об исполнении</span><input :value="props.filters.executionMark" data-filter="executionMark" type="search" :maxlength="REGISTRY_FILTER_LIMITS.executionMark" placeholder="Текст комментария" @input="update('executionMark', $event)" /></label>
        </fieldset>
        <div class="registry-filter-footer"><p v-if="props.error" class="registry-inline-error" role="alert">{{ props.error }}</p><p v-else class="registry-help">Все условия — одновременно. Даты включительно.</p><div class="registry-actions"><button class="registry-button" type="button" :disabled="props.disabled" @click="reset">Сбросить</button><button class="registry-button registry-button-primary" type="submit" :disabled="props.disabled">Применить</button></div></div>
      </form>
    </div>
    </Teleport>
  </div>
</template>
