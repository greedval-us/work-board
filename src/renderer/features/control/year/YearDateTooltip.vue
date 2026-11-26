<script setup>
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { formatDate } from '../../../../shared/dates.js';
import { isYearEventOverdue } from './yearOverdue.js';
import { registryLocation } from '../../registry/registryLocation.js';
import { planningLocation } from '../../planning/planningLocation.js';

const props = defineProps({
  id: { type: String, required: true }, date: { type: String, required: true }, today: { type: String, required: true },
  events: { type: Array, required: true }, anchor: { type: Object, required: true },
  viewport: { type: Object, required: true }, planning: Boolean, closed: Boolean,
});
const emit = defineEmits(['close', 'hover', 'open-record']);
const panel = useTemplateRef('panel');
const position = shallowRef({ visibility: 'hidden' });
let frame;
let observer;

function place() {
  const node = panel.value;
  if (!node) return;
  const rect = props.anchor.getBoundingClientRect();
  const clip = props.viewport.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  if (!props.anchor.isConnected || rect.bottom <= Math.max(0, clip.top) || rect.top >= Math.min(height, clip.bottom)
    || rect.right <= Math.max(0, clip.left) || rect.left >= Math.min(width, clip.right)) {
    emit('close');
    return;
  }
  const margin = 8;
  const gap = 4;
  const above = rect.top - gap - margin;
  const below = height - rect.bottom - gap - margin;
  const naturalHeight = node.scrollHeight + node.offsetHeight - node.clientHeight;
  const openDown = below >= naturalHeight || below >= above;
  const maxHeight = Math.min(Math.max(1, openDown ? below : above), Math.round(height * .7));
  const popupHeight = Math.min(maxHeight, naturalHeight);
  const left = Math.max(margin, Math.min(rect.left + (rect.width - node.offsetWidth) / 2, width - margin - node.offsetWidth));
  const top = openDown ? rect.bottom + gap : rect.top - gap - popupHeight;
  position.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px`, maxHeight: `${maxHeight}px` };
}

function queuePlacement() {
  if (!frame) frame = requestAnimationFrame(() => { frame = null; place(); });
}

function dismissOutside(event) {
  if (!panel.value?.contains(event.target) && !props.anchor.contains(event.target)) emit('close');
}

function dismissOnEscape(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close', panel.value?.contains(document.activeElement));
  }
}

function locationFor(event) {
  const query = event.kind === 'checkpoint' ? { checkpoint: event.date } : {};
  return props.planning ? planningLocation(props.closed, { plan: event.id, ...query })
    : registryLocation(props.closed, { instruction: event.id, ...query });
}

function activate(click, event) {
  if (click.defaultPrevented || (click.button !== undefined && click.button !== 0)
    || click.altKey || click.ctrlKey || click.metaKey || click.shiftKey) return;
  click.preventDefault();
  emit('open-record', event.id, event.kind === 'checkpoint' ? event.date : '');
}

function focusFirst() {
  const first = panel.value?.querySelector('a[href]');
  first?.focus();
  return Boolean(first && document.activeElement === first);
}

function exitOnTab(event) {
  if (event.key !== 'Tab') return;
  const links = panel.value.querySelectorAll('a[href]');
  if (event.shiftKey && event.target === links[0]) {
    event.preventDefault();
    props.anchor.focus({ preventScroll: true });
  } else if (!event.shiftKey && event.target === links[links.length - 1]) {
    // Resume the native tab order from the date, since the panel is teleported.
    emit('close', true);
  }
}

function leavePanel(event) {
  if (event.relatedTarget && event.relatedTarget !== props.anchor && !panel.value?.contains(event.relatedTarget)) emit('close');
}

function scrollByKey(event) {
  const node = panel.value;
  if (!node || node.scrollHeight <= node.clientHeight || event.currentTarget !== props.anchor) return;
  const distance = { ArrowDown: 32, ArrowUp: -32, PageDown: node.clientHeight, PageUp: -node.clientHeight,
    Home: -node.scrollHeight, End: node.scrollHeight }[event.key];
  if (distance === undefined) return;
  event.preventDefault();
  node.scrollTop += distance;
}

watch(() => [props.date, props.events], async () => {
  await nextTick();
  if (panel.value) panel.value.scrollTop = 0;
  place();
});
onMounted(() => {
  place();
  window.addEventListener('resize', queuePlacement);
  window.addEventListener('scroll', queuePlacement, true);
  document.addEventListener('pointerdown', dismissOutside, true);
  document.addEventListener('keydown', dismissOnEscape);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(queuePlacement);
    observer.observe(panel.value);
    observer.observe(props.viewport);
  }
});
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
  observer?.disconnect();
  window.removeEventListener('resize', queuePlacement);
  window.removeEventListener('scroll', queuePlacement, true);
  document.removeEventListener('pointerdown', dismissOutside, true);
  document.removeEventListener('keydown', dismissOnEscape);
});
defineExpose({ scrollByKey, focusFirst, contains: node => Boolean(node && panel.value?.contains(node)) });
</script>

<template>
  <Teleport to="body">
    <div :id="id" ref="panel" class="control-year-tooltip" :class="{ 'control-year-plan-tooltip': planning }" role="dialog" :aria-labelledby="`${id}-date`" :style="position"
      @keydown="exitOnTab" @focusout="leavePanel"
      @pointerenter="emit('hover', true)" @pointerleave="emit('hover', false)">
      <time :id="`${id}-date`" class="control-year-tip-date" :datetime="date">{{ formatDate(date) }}</time>
      <ul>
        <li v-for="event in events" :key="`${event.kind}:${event.id}`" :class="{ 'control-year-tip-overdue': isYearEventOverdue(event, today, closed) }">
          <div class="control-year-tip-heading">
            <span>{{ event.kind === 'deadline' ? 'Срок исполнения' : 'Промежуточная проверка' }}</span>
            <span v-if="event.completed" class="control-year-tip-status">{{ event.kind === 'checkpoint' ? 'Есть отметка' : closed ? 'Контроль закрыт' : 'Исполнено' }}</span>
            <span v-else-if="isYearEventOverdue(event, today, closed)" class="control-year-tip-overdue-status">Просрочено</span>
          </div>
          <strong>
            <RouterLink v-slot="{ href }" :to="locationFor(event)" custom>
              <a class="control-year-record-link" :href="href"
                :aria-label="[event.title, event.planItem, `№ ${event.instructionNumber}`, event.kind === 'checkpoint' ? 'Промежуточная проверка' : 'Срок исполнения'].filter(Boolean).join(', ')"
                @click="activate($event, event)">{{ event.title }}</a>
            </RouterLink>
          </strong>
          <dl>
            <template v-if="planning && event.planItem"><dt>Пункт плана</dt><dd>{{ event.planItem }}</dd></template>
            <dt>Подписной номер</dt><dd>{{ event.instructionNumber }}</dd>
            <dt>Исполнитель</dt><dd>{{ event.executor }}</dd>
          </dl>
        </li>
      </ul>
    </div>
  </Teleport>
</template>

<style scoped>
.control-year-tooltip { --tip-accent: var(--accent); position: fixed; z-index: 100; box-sizing: border-box; width: min(330px, calc(100vw - 16px)); max-height: calc(100vh - 16px); padding: 12px 14px; border: 1px solid var(--border); border-inline-start: 3px solid var(--tip-accent); border-radius: 10px; background: var(--panel); color: var(--text); box-shadow: var(--surface-shadow), 0 4px 18px rgb(0 0 0 / .16); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; overflow-wrap: anywhere; }
.control-year-plan-tooltip { --tip-accent: var(--violet); }
.control-year-tip-date { color: var(--text); font-size: calc(13px + var(--app-font-offset)); font-weight: 650; font-variant-numeric: tabular-nums; }
.control-year-tooltip ul { margin: 7px 0 0; padding: 0; list-style: none; }
.control-year-tooltip li + li { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--border); }
.control-year-tip-heading { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 2px 8px; color: var(--tip-accent); font-size: calc(11px + var(--app-font-offset)); font-weight: 600; }
.control-year-tip-status { color: var(--teal); }
.control-year-tip-overdue .control-year-tip-heading { color: var(--error); }
.control-year-tip-overdue-status { padding: 0 5px; border-radius: 3px; background: var(--error-surface); color: var(--error); }
.control-year-tooltip strong { display: block; margin: 2px 0 4px; font-size: calc(13px + var(--app-font-offset)); line-height: 1.35; font-weight: 600; }
.control-year-record-link { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.control-year-record-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
.control-year-tooltip dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; margin: 0; font-size: calc(11px + var(--app-font-offset)); }
.control-year-tooltip dt { color: var(--muted); }
.control-year-tooltip dd { margin: 0; }
</style>
