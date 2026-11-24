<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, RefreshCw, ChevronRight, HardDrive, LockKeyhole } from 'lucide-vue-next';
import { localDate } from '../../shared/dates.js';
import AppSidebar from './AppSidebar.vue';
import AppLockScreen from './AppLockScreen.vue';
import { useAppLockStore } from './appLockStore.js';
import { useAppStore } from './appStore.js';
import { useAppearance } from './useAppearance.js';
import { useErrorStore } from './errorStore.js';
import ErrorBoundary from './ErrorBoundary.vue';
import NotificationCenter from '../features/notifications/NotificationCenter.vue';
import { useNotificationsStore } from '../features/notifications/notificationsStore.js';
import { subscribeNotificationOpen } from '../features/notifications/NotificationService.js';

const store = useAppStore();
const appLock = useAppLockStore();
const errors = useErrorStore();
const notifications = useNotificationsStore();
const compactQuery = window.matchMedia('(max-width: 1079px)');
const compact = shallowRef(compactQuery.matches);
const collapsed = shallowRef(compact.value);
const mainContent = useTemplateRef('mainContent');
const navigationToggle = useTemplateRef('navigationToggle');
const sidebarFrame = useTemplateRef('sidebarFrame');
const workspaceMounted = shallowRef(false);
const locking = shallowRef(false);
const route = useRoute();
const databaseName = computed(() => store.database?.ready ? store.database.filePath?.split(/[\\/]/).pop() : '');
const storageLabel = computed(() => store.database?.ready ? 'Подключена' : 'Не выбрана');
const navigationLabel = computed(() => collapsed.value ? 'Развернуть меню' : 'Свернуть меню');
const currentDay = shallowRef(new Date());
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
let dayTimer;
let unsubscribeLock;
let unsubscribeNotificationOpen;
let focusBeforeLock;
function syncDay() {
  const now = new Date();
  currentDay.value = now;
  clearTimeout(dayTimer);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dayTimer = setTimeout(syncDay, tomorrow - now + 100);
}
const { isDark, toggleAppearance } = useAppearance();
const appearanceLabel = computed(() => isDark.value ? 'Включить светлую тему' : 'Включить тёмную тему');
function resizeNavigation(event) {
  compact.value = event.matches;
  collapsed.value = event.matches;
}
function closeNavigation(restoreFocus = false) {
  if (!compact.value || collapsed.value) return;
  collapsed.value = true;
  if (restoreFocus) nextTick(() => navigationToggle.value?.focus());
}
function toggleNavigation() {
  collapsed.value = !collapsed.value;
  if (compact.value && !collapsed.value) nextTick(() => sidebarFrame.value?.querySelector('.sidebar-close')?.focus());
}
function containNavigationFocus(event) {
  if (!compact.value || collapsed.value || event.defaultPrevented) return;
  const elements = [...sidebarFrame.value.querySelectorAll('.sidebar-floating a[href],.sidebar-floating button:not([disabled])')]
    .filter(element => element.getClientRects().length);
  const first = elements[0];
  const last = elements.at(-1);
  if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
function prepareNavigationLeave(element) {
  element.inert = true;
  element.setAttribute('aria-hidden', 'true');
}
function prepareNavigationEnter(element) {
  element.inert = false;
  element.removeAttribute('aria-hidden');
}
function beforeUnload(event) {
  if (!window.__workBoardAllowClose && (store.hasUnsavedGuards() || store.pendingOperations > 0 || store.databaseSwitching)) {
    event.preventDefault();
    event.returnValue = '';
  }
}
async function lockApplication() {
  if (locking.value) return;
  locking.value = true;
  try { await appLock.lock(); }
  catch (cause) { if (!appLock.blocked) errors.report(cause); }
  finally { locking.value = false; }
}
watch(() => appLock.blocked, blocked => {
  if (blocked && workspaceMounted.value) focusBeforeLock = document.activeElement;
  document.documentElement.toggleAttribute('data-app-lock-blocked', blocked);
  store.workspaceLocked = blocked;
  if (blocked) return;
  workspaceMounted.value = true;
  if (!store.initialized) void store.initialize();
  if (focusBeforeLock) {
    const previous = focusBeforeLock;
    focusBeforeLock = undefined;
    nextTick(() => {
      if (appLock.blocked) return;
      if (previous.isConnected) previous.focus();
      else mainContent.value?.focus();
    });
  }
}, { immediate: true, flush: 'sync' });
onMounted(() => {
  syncDay();
  window.addEventListener('focus', syncDay);
  compactQuery.addEventListener('change', resizeNavigation);
  unsubscribeNotificationOpen = subscribeNotificationOpen(payload => { void notifications.openFromSystem(payload); });
  unsubscribeLock = appLock.subscribe();
  void appLock.initialize();
  window.__workBoardConfirmClose = () => !appLock.blocked && store.prepareToClose();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  unsubscribeLock?.();
  unsubscribeNotificationOpen?.();
  document.documentElement.removeAttribute('data-app-lock-blocked');
  clearTimeout(dayTimer);
  window.removeEventListener('focus', syncDay);
  compactQuery.removeEventListener('change', resizeNavigation);
  window.removeEventListener('beforeunload', beforeUnload);
  delete window.__workBoardConfirmClose;
});
</script>

<template>
  <div v-if="workspaceMounted" class="app-shell" :inert="appLock.blocked" :aria-hidden="appLock.blocked || undefined"
    @keydown.esc="closeNavigation(true)" @keydown.tab="containNavigationFocus">
    <a href="#main-content" class="skip-link" @click.prevent="mainContent?.focus()">Перейти к содержимому</a>
    <Transition name="navigation-shade">
      <button v-if="compact && !collapsed" class="sidebar-backdrop" type="button" tabindex="-1" aria-label="Закрыть меню" @click="closeNavigation(true)" />
    </Transition>
    <div ref="sidebarFrame" class="sidebar-frame" :class="{ 'sidebar-frame-collapsed': compact || collapsed, 'sidebar-frame-overlay': compact && !collapsed }">
      <AppSidebar :collapsed="compact || collapsed" :inert="compact && !collapsed" :aria-hidden="compact && !collapsed || undefined" @navigate="closeNavigation()" />
      <button ref="navigationToggle" type="button" class="icon-button sidebar-toggle" :inert="compact && !collapsed"
        :aria-expanded="!collapsed" :aria-controls="compact && !collapsed ? 'expanded-navigation' : 'main-navigation'"
        :aria-label="navigationLabel" :title="navigationLabel" @click="toggleNavigation">
        <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" :size="17" aria-hidden="true" />
      </button>
      <footer class="sidebar-footer" :inert="compact && !collapsed">
        <RouterLink class="storage-link" to="/settings" :title="store.database?.filePath || 'Настройки хранилища'"
          :aria-label="databaseName ? `Настройки хранилища, ${databaseName}` : 'Настройки хранилища'">
          <span class="storage-symbol"><HardDrive :size="18" aria-hidden="true" /><i class="storage-dot" :class="{ 'storage-dot-ready': store.database?.ready }" /></span>
          <span class="storage-copy"><span class="footer-title">{{ databaseName || 'Локальная база' }}</span><span class="footer-caption">{{ storageLabel }}</span></span>
          <ChevronRight class="storage-chevron" :size="13" aria-hidden="true" />
        </RouterLink>
        <div class="sidebar-tools">
          <time class="toolbar-date" :datetime="localDate(currentDay)">{{ dayFormatter.format(currentDay) }}</time>
          <NotificationCenter />
          <button v-if="appLock.status?.enabled" type="button" class="icon-button" :disabled="locking"
            aria-label="Заблокировать приложение" title="Заблокировать приложение" @click="lockApplication">
            <LockKeyhole :size="16" aria-hidden="true" />
          </button>
          <button type="button" class="icon-button theme-toggle" :disabled="!store.database?.ready || store.saving || store.databaseSwitching"
            :aria-label="appearanceLabel" :title="appearanceLabel" @click="toggleAppearance">
            <Transition name="theme-symbol" mode="out-in"><component :is="isDark ? Sun : Moon" :size="16" aria-hidden="true" /></Transition>
          </button>
        </div>
      </footer>
      <Transition name="navigation-panel" @before-enter="prepareNavigationEnter" @before-leave="prepareNavigationLeave">
        <AppSidebar v-if="compact && !collapsed" class="sidebar-floating" navigation-id="expanded-navigation" overlay @navigate="closeNavigation()" @close="closeNavigation(true)" />
      </Transition>
    </div>
    <div class="app-body" :inert="compact && !collapsed">
      <div v-if="store.error" class="error-banner" role="alert">
        <span>{{ store.error }}</span>
        <button type="button" class="text-button" :disabled="store.loading || store.saving" @click="store.initialize">
          <RefreshCw :size="15" aria-hidden="true" />Повторить
        </button>
      </div>
      <div v-if="errors.notification" class="error-banner" role="alert">
        <span>{{ errors.notification.message }}</span>
        <button type="button" class="text-button" @click="errors.dismiss">Закрыть</button>
      </div>
      <main id="main-content" ref="mainContent" class="main-content" tabindex="-1" :aria-busy="store.loading">
        <ErrorBoundary :reset-key="route.path">
          <RouterView v-slot="{ Component }">
            <Transition name="workspace" mode="out-in">
              <component :is="Component" :key="route.path" />
            </Transition>
          </RouterView>
        </ErrorBoundary>
      </main>
    </div>
  </div>
  <AppLockScreen v-if="appLock.blocked" />
</template>
