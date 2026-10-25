<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { PanelLeft, Sun, Moon, RefreshCw } from 'lucide-vue-next';
import AppSidebar from '../../components/AppSidebar.vue';
import { useAppStore } from '../../stores/appStore.js';
import { useAppearance } from '../../composables/useAppearance.js';
import { useErrorStore } from '../../stores/errorStore.js';
import ErrorBoundary from '../../components/ui/ErrorBoundary.vue';

const store = useAppStore();
const errors = useErrorStore();
const compactQuery = window.matchMedia('(max-width: 1279px)');
const compact = shallowRef(compactQuery.matches);
const collapsed = shallowRef(compact.value);
const mainContent = useTemplateRef('mainContent');
const navigationToggle = useTemplateRef('navigationToggle');
const sidebarFrame = useTemplateRef('sidebarFrame');
const route = useRoute();
const title = computed(() => route.meta.title ?? 'Work Board');
const { isDark, toggleAppearance } = useAppearance();
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
onMounted(() => {
  compactQuery.addEventListener('change', resizeNavigation);
  store.initialize();
  window.__workBoardConfirmClose = () => store.prepareToClose();
  window.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  compactQuery.removeEventListener('change', resizeNavigation);
  window.removeEventListener('beforeunload', beforeUnload);
  delete window.__workBoardConfirmClose;
});
</script>

<template>
  <div class="app-shell" @keydown.esc="closeNavigation(true)" @keydown.tab="containNavigationFocus">
    <a href="#main-content" class="skip-link" @click.prevent="mainContent?.focus()">Перейти к содержимому</a>
    <Transition name="navigation-shade">
      <button v-if="compact && !collapsed" class="sidebar-backdrop" type="button" tabindex="-1" aria-label="Закрыть меню" @click="closeNavigation(true)" />
    </Transition>
    <div ref="sidebarFrame" class="sidebar-frame" :class="{ 'sidebar-frame-collapsed': collapsed, 'sidebar-frame-overlay': compact && !collapsed }">
      <AppSidebar :collapsed="compact || collapsed" :inert="compact && !collapsed" :aria-hidden="compact && !collapsed || undefined" :ready="store.database?.ready === true" @navigate="closeNavigation()" />
      <Transition name="navigation-panel" @before-enter="prepareNavigationEnter" @before-leave="prepareNavigationLeave">
        <AppSidebar v-if="compact && !collapsed" class="sidebar-floating" navigation-id="expanded-navigation" overlay :ready="store.database?.ready === true" @navigate="closeNavigation()" @close="closeNavigation(true)" />
      </Transition>
    </div>
    <div class="app-body" :inert="compact && !collapsed">
      <header class="toolbar">
        <div class="toolbar-start">
          <button ref="navigationToggle" type="button" class="icon-button sidebar-toggle" :aria-expanded="!collapsed"
            :aria-controls="compact && !collapsed ? 'expanded-navigation' : 'main-navigation'"
            :aria-label="collapsed ? 'Развернуть меню' : 'Свернуть меню'" @click="toggleNavigation">
            <PanelLeft :size="18" aria-hidden="true" />
          </button>
          <span class="toolbar-title">{{ title }}</span>
        </div>
        <div class="toolbar-end">
          <span class="local-label"><span class="status-dot" :class="{ 'status-dot-ready': store.database?.ready }" />Локально</span>
          <button type="button" class="icon-button" :disabled="!store.database?.ready || store.saving || store.databaseSwitching"
            :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleAppearance">
            <component :is="isDark ? Sun : Moon" :size="18" aria-hidden="true" />
          </button>
        </div>
      </header>
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
</template>
