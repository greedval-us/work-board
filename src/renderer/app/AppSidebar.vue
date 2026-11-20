<script setup>
import { Archive, Files, CalendarDays, ChartNoAxesColumnIncreasing, Info, ListTodo, Settings, X } from 'lucide-vue-next';
import AppIcon from '../ui/AppIcon.vue';

defineProps({
  collapsed: { type: Boolean, default: false },
  overlay: { type: Boolean, default: false },
  navigationId: { type: String, default: 'main-navigation' },
});
defineEmits(['navigate', 'close']);

const navigation = [
  { to: '/', label: 'Реестр указаний', icon: Files, tone: 'blue' },
  { to: '/closed-control', label: 'Закрытый контроль', icon: Archive, tone: 'violet' },
  { to: '/calendar', label: 'Календарь', icon: CalendarDays, tone: 'coral' },
  { to: '/tasks', label: 'Задачи', icon: ListTodo, tone: 'amber' },
  { to: '/analytics', label: 'Аналитика', icon: ChartNoAxesColumnIncreasing, tone: 'teal' },
  { to: '/settings', label: 'Настройки', icon: Settings, utilityFirst: true },
  { to: '/info', label: 'О приложении', icon: Info },
];
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
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to"
        class="nav-item" :class="{ 'nav-item-utility-first': item.utilityFirst }" :title="item.label" :aria-label="item.label" exact-active-class="nav-item-active" @click="$emit('navigate')">
        <span class="nav-symbol" :class="item.tone && `nav-symbol-${item.tone}`">
          <component :is="item.icon" :size="18" :stroke-width="1.8" aria-hidden="true" />
        </span>
        <span class="sidebar-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>
