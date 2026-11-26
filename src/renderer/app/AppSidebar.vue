<script setup>
import { computed } from 'vue';
import { Files, CalendarCheck, CalendarDays, ChartNoAxesColumnIncreasing, ChartNoAxesCombined, Info, ListTodo, Settings, X } from 'lucide-vue-next';
import { useAppStore } from './appStore.js';
import AppIcon from '../ui/AppIcon.vue';
import { navigationGlyphs } from '../ui/navigationGlyphs.js';

defineProps({
  collapsed: { type: Boolean, default: false },
  overlay: { type: Boolean, default: false },
  navigationId: { type: String, default: 'main-navigation' },
});
defineEmits(['navigate', 'close']);

const store = useAppStore();
const glyphs = computed(() => navigationGlyphs[store.appearanceStyle]);
const navigation = [
  { to: '/', label: 'Реестр контроля', glyph: 'register', icon: Files, tone: 'blue' },
  { to: '/planning-control', label: 'Контроль планирования', glyph: 'planningControl', icon: CalendarCheck, tone: 'coral', requiresPlanning: true },
  { to: '/calendar', label: 'Календарь', glyph: 'calendar', icon: CalendarDays, tone: 'coral' },
  { to: '/tasks', label: 'Задачи', glyph: 'tasks', icon: ListTodo, tone: 'amber' },
  { to: '/analytics', label: 'Аналитика контроля', glyph: 'analytics', icon: ChartNoAxesColumnIncreasing, tone: 'teal' },
  { to: '/planning-analytics', label: 'Аналитика планирования', glyph: 'planningAnalytics', icon: ChartNoAxesCombined, tone: 'teal', requiresPlanning: true },
  { to: '/settings', label: 'Настройки', glyph: 'settings', icon: Settings, utilityFirst: true },
  { to: '/info', label: 'О приложении', glyph: 'info', icon: Info },
];
const visibleNavigation = computed(() => navigation.filter(item => !item.requiresPlanning || store.planningEnabled));
</script>

<template>
  <aside :id="navigationId" class="sidebar" :class="{ 'sidebar-collapsed': collapsed }" :role="overlay ? 'dialog' : undefined" :aria-modal="overlay || undefined" aria-label="Навигация">
    <RouterLink to="/" class="brand" aria-label="Work Board — главная" @click="$emit('navigate')">
      <AppIcon :size="35" />
      <span class="sidebar-label brand-copy">
        <span class="brand-title">Work Board</span>
        <span class="brand-caption">Контроль исполнения</span>
      </span>
    </RouterLink>
    <button v-if="overlay" class="sidebar-close icon-button" type="button" aria-label="Свернуть меню" @click="$emit('close')"><X :size="16" aria-hidden="true" /></button>
    <nav class="sidebar-nav" aria-label="Главное меню">
      <span class="sidebar-label nav-section-label" aria-hidden="true">Рабочая область</span>
      <RouterLink v-for="item in visibleNavigation" :key="item.to" :to="item.to"
        class="nav-item" :class="{ 'nav-item-utility-first': item.utilityFirst }" :title="item.label" :aria-label="item.label" exact-active-class="nav-item-active" @click="$emit('navigate')">
        <span class="nav-symbol" :class="item.tone && `nav-symbol-${item.tone}`">
          <svg v-if="glyphs?.[item.glyph]" class="nav-glyph" :data-glyph-style="store.appearanceStyle" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true" focusable="false">
            <path :d="glyphs[item.glyph].outline" />
            <path v-if="glyphs[item.glyph].etch" class="nav-glyph-etch" :d="glyphs[item.glyph].etch" />
            <path v-if="glyphs[item.glyph].paint" class="nav-glyph-paint" :d="glyphs[item.glyph].paint" stroke="none" />
          </svg>
          <component :is="item.icon" v-else :size="18" :stroke-width="1.8" aria-hidden="true" />
        </span>
        <span class="sidebar-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.nav-glyph { display: block; color: var(--accent); --glyph-detail: var(--ornament-ink); }
.nav-glyph[data-glyph-style='witcher'] { color: var(--text); stroke-linecap: square; stroke-linejoin: bevel; }
.nav-glyph[data-glyph-style='cyberpunk'] { stroke-linecap: square; stroke-linejoin: miter; }
.nav-glyph-etch { stroke: var(--glyph-detail); }
.nav-glyph-paint { fill: var(--glyph-detail); }
.nav-item-active .nav-glyph { color: inherit; --glyph-detail: currentColor; }
@media (forced-colors: active) {
  .nav-item .nav-glyph { color: inherit; --glyph-detail: currentColor; }
}
</style>
