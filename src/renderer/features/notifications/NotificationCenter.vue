<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { isNavigationFailure, useRouter } from 'vue-router';
import { ArrowUpRight, Bell, CheckCheck, RefreshCw, X } from 'lucide-vue-next';
import { formatDate } from '../../../shared/dates.js';
import { notificationKey } from '../../../shared/notificationReference.js';
import { groupNotifications, NOTIFICATION_GROUP_SIZE, UPCOMING_DEADLINES } from './notificationGroups.js';
import { useAppStore } from '../../app/appStore.js';
import { useNotifications } from './useNotifications.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';

const app = useAppStore();
const store = useNotifications();
const { items, today, unreadCount, loading, error, saving, popup } = storeToRefs(store);
const router = useRouter();
const center = useTemplateRef('center');
const bell = useTemplateRef('bell');
const panel = useTemplateRef('panel');
const panelId = useId();
const headingId = useId();
const popupHeadingId = useId();
const open = shallowRef(false);
const navigating = shallowRef(false);
const actionError = shallowRef('');
let pendingSystemOpen = false;
const visibleCounts = shallowRef({});
const popupTitleLimit = 2;
const disabled = computed(() => !app.database?.ready || app.databaseSwitching);
const busy = computed(() => disabled.value || saving.value || navigating.value);
const badge = computed(() => unreadCount.value > 99 ? '99+' : String(unreadCount.value));
const bellLabel = computed(() => `${unreadCount.value ? `Уведомления: непрочитанных ${unreadCount.value}` : 'Уведомления'}${error.value || actionError.value ? '. Не удалось обновить уведомления' : ''}`);
const groups = computed(() => groupNotifications(items.value, today.value).map(group => ({
  ...group, visible: group.items.slice(0, visibleCounts.value[group.key] ?? NOTIFICATION_GROUP_SIZE),
})));
const popupItems = computed(() => popup.value?.items ?? []);
const popupVisible = computed(() => !disabled.value && !open.value && popupItems.value.length > 0);
const popupSummary = computed(() => groupNotifications(popupItems.value, today.value)
  .map(group => `${group.title}: ${group.items.length}`).join(' · '));
const kinds = { instruction: 'Указание', task: 'Задача', checkpoint: 'Промежуточный контроль' };
let navigationSequence = 0;

async function acknowledgePopup() {
  if (!popup.value || disabled.value) return;
  const generation = app.database?.generation;
  try { await store.dismissPopup(); }
  catch (cause) {
    if (generation === app.database?.generation) actionError.value = errorMessage(cause, 'Не удалось закрыть напоминание. Повторите попытку.');
  }
}

async function showPanel() {
  if (disabled.value) return;
  open.value = true;
  actionError.value = '';
  if (popup.value) void acknowledgePopup();
  await nextTick();
  if (open.value) panel.value?.focus();
}

function closePanel(restoreFocus = false) {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) nextTick(() => {
    if (!disabled.value && !document.activeElement?.closest?.('dialog[open]')) bell.value?.focus();
  });
}

function togglePanel() { return open.value ? closePanel(true) : showPanel(); }

async function openSystemPanel() {
  await nextTick();
  if (!pendingSystemOpen || disabled.value || document.querySelector?.('dialog[open]')) return;
  pendingSystemOpen = false;
  await showPanel();
}
watch(() => store.openRequest, () => { pendingSystemOpen = true; void openSystemPanel(); });

function closeIfOutside(event) {
  if (open.value && !center.value?.contains(event.target)) closePanel(false);
}

function escapePanel(event) {
  if (!open.value || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closePanel(true);
}

async function openItem(item) {
  if (busy.value) return;
  const generation = app.database?.generation;
  const notification = `${Date.now()}-${++navigationSequence}`;
  const target = item.kind === 'task'
    ? { name: 'Calendar', query: { task: item.recordId, date: item.date, notification } }
    : { name: 'Registry', query: { instruction: item.recordId, ...(item.kind === 'checkpoint' ? { checkpoint: item.date } : {}), notification } };
  navigating.value = true;
  actionError.value = '';
  try {
    const result = await router.push(target);
    if (result === false || isNavigationFailure(result) || generation !== app.database?.generation) return;
    closePanel(false);
    await store.markRead(item);
  } catch (cause) {
    if (generation === app.database?.generation) actionError.value = errorMessage(cause, 'Не удалось открыть запись. Повторите попытку.');
  } finally { navigating.value = false; }
}

async function markAllRead() {
  if (busy.value) return;
  const generation = app.database?.generation;
  actionError.value = '';
  try { await store.markAllRead(); }
  catch (cause) {
    if (generation === app.database?.generation) actionError.value = errorMessage(cause, 'Не удалось отметить уведомления прочитанными.');
  }
}

function showMore(group) {
  visibleCounts.value = { ...visibleCounts.value, [group.key]: group.visible.length + NOTIFICATION_GROUP_SIZE };
}

watch([() => app.database?.generation, disabled], () => {
  closePanel(false);
  pendingSystemOpen = false;
  actionError.value = '';
  visibleCounts.value = {};
}, { flush: 'sync' });
onMounted(() => {
  document.addEventListener('pointerdown', closeIfOutside);
  document.addEventListener('focusin', closeIfOutside);
  document.addEventListener('keydown', escapePanel);
  document.addEventListener('close', openSystemPanel, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeIfOutside);
  document.removeEventListener('focusin', closeIfOutside);
  document.removeEventListener('keydown', escapePanel);
  document.removeEventListener('close', openSystemPanel, true);
});
</script>

<template>
  <div ref="center" class="notification-center">
    <button ref="bell" type="button" class="icon-button notification-bell" data-notification-action="toggle"
      :disabled="disabled" :aria-label="bellLabel" :title="bellLabel" :aria-expanded="open" :aria-controls="panelId"
      aria-haspopup="dialog" @click="togglePanel">
      <Bell :size="18" aria-hidden="true" />
      <span v-if="unreadCount" class="notification-count" aria-hidden="true">{{ badge }}</span>
      <span v-if="error || actionError" class="notification-error-indicator" aria-hidden="true">!</span>
    </button>

    <section v-if="open" :id="panelId" ref="panel" class="notification-panel" data-notification-action="panel"
      role="dialog" :aria-labelledby="headingId" :aria-busy="loading || saving" tabindex="-1">
      <header class="notification-panel-heading">
        <div><h2 :id="headingId">Уведомления</h2><p>Сроки и промежуточный контроль</p></div>
        <button type="button" class="icon-button" aria-label="Закрыть уведомления" @click="closePanel(true)"><X :size="18" aria-hidden="true" /></button>
      </header>
      <div class="notification-panel-actions">
        <span>{{ unreadCount ? `Непрочитанных: ${unreadCount}` : 'Всё прочитано' }}</span>
        <button type="button" class="notification-text-button" :disabled="busy || !unreadCount" @click="markAllRead">
          <CheckCheck :size="15" aria-hidden="true" />Прочитать все
        </button>
      </div>
      <div v-if="error || actionError" class="notification-error" role="alert">
        <p>{{ error || actionError }}</p>
        <button v-if="error" type="button" class="notification-text-button" :disabled="loading || busy" @click="store.refresh()"><RefreshCw :size="14" aria-hidden="true" />Повторить</button>
      </div>
      <div class="notification-panel-content">
        <p v-if="loading && !items.length" class="notification-empty" role="status">Загружаем уведомления…</p>
        <div v-else-if="!items.length && !error" class="notification-empty">
          <Bell :size="25" aria-hidden="true" /><h3>Ближайших напоминаний нет</h3><p>Здесь появятся незавершённые записи со сроком {{ UPCOMING_DEADLINES.toLowerCase() }}, сегодня или ранее.</p>
        </div>
        <template v-else-if="items.length">
          <section v-for="group in groups" :key="group.key" class="notification-group" :aria-labelledby="`${panelId}-${group.key}`">
            <h3 :id="`${panelId}-${group.key}`">{{ group.title }}<span>{{ group.items.length }}</span></h3>
            <ul class="notification-list">
              <li v-for="item in group.visible" :key="notificationKey(item)" :class="{ 'notification-unread': item.unread }">
                <button type="button" class="notification-record" data-notification-action="open-item" :disabled="busy" @click="openItem(item)">
                  <span class="notification-record-heading"><span>{{ kinds[item.kind] }}<template v-if="item.instructionNumber"> · № {{ item.instructionNumber }}</template></span><ArrowUpRight :size="14" aria-hidden="true" /></span>
                  <strong>{{ item.title }}</strong>
                  <span class="notification-record-meta"><span class="notification-urgency" :class="`notification-${group.key}`">{{ group.title }}</span><time :datetime="item.date">{{ formatDate(item.date) }}</time><span v-if="item.unread" class="notification-unread-label">Не прочитано</span></span>
                </button>
              </li>
            </ul>
            <button v-if="group.visible.length < group.items.length" type="button" class="notification-show-more" data-notification-action="show-more" @click="showMore(group)">Показать ещё · {{ group.visible.length }} из {{ group.items.length }}</button>
          </section>
        </template>
      </div>
    </section>

    <section v-if="popupVisible" class="notification-popup" :aria-labelledby="popupHeadingId">
      <header><span class="notification-popup-icon"><Bell :size="19" aria-hidden="true" /></span><h2 :id="popupHeadingId">Напоминания о сроках</h2><button type="button" class="icon-button" aria-label="Закрыть напоминание" @click="acknowledgePopup"><X :size="16" aria-hidden="true" /></button></header>
      <p class="notification-popup-summary" role="status">{{ popupSummary }}</p>
      <ul class="notification-popup-titles"><li v-for="item in popupItems.slice(0, popupTitleLimit)" :key="notificationKey(item)">{{ item.title }}</li></ul>
      <p v-if="popupItems.length > popupTitleLimit" class="notification-popup-more">И ещё {{ popupItems.length - popupTitleLimit }}</p>
      <button type="button" class="notification-open-list" data-notification-action="show-list" @click="showPanel">Открыть уведомления <ArrowUpRight :size="15" aria-hidden="true" /></button>
    </section>
  </div>
</template>
