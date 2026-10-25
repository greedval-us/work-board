<script setup>
import { ClipboardList, CalendarDays, Settings2, Info, HardDrive, X } from 'lucide-vue-next';
import AppIcon from './ui/AppIcon.vue';

defineProps({
  collapsed: { type: Boolean, default: false },
  ready: { type: Boolean, default: false },
  overlay: { type: Boolean, default: false },
  navigationId: { type: String, default: 'main-navigation' },
});
defineEmits(['navigate', 'close']);

const navigation = [
  { to: '/', label: 'Реестр указаний', icon: ClipboardList },
  { to: '/calendar', label: 'Календарь и задачи', icon: CalendarDays },
  { to: '/settings', label: 'Настройки', icon: Settings2, utilityFirst: true },
  { to: '/info', label: 'О приложении', icon: Info },
];
</script>

<template>
  <aside :id="navigationId" class="sidebar" :class="{ 'sidebar-collapsed': collapsed }" :role="overlay ? 'dialog' : undefined" :aria-modal="overlay || undefined" aria-label="Навигация">
    <RouterLink to="/" class="brand" aria-label="Work Board — главная" @click="$emit('navigate')">
      <AppIcon :size="34" />
      <span class="sidebar-label brand-copy">
        <span class="brand-title">Work Board</span>
        <span class="brand-caption">Контроль исполнения</span>
      </span>
    </RouterLink>
    <button v-if="overlay" class="sidebar-close icon-button" type="button" aria-label="Свернуть меню" @click="$emit('close')"><X :size="16" aria-hidden="true" /></button>
    <nav class="sidebar-nav" aria-label="Главное меню">
      <RouterLink v-for="item in navigation" :key="item.to" :to="item.to"
        class="nav-item" :class="{ 'nav-item-utility-first': item.utilityFirst }" :title="item.label" :aria-label="item.label" exact-active-class="nav-item-active" @click="$emit('navigate')">
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span class="sidebar-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
    <div class="sidebar-footer" :title="ready ? 'Локальное хранилище подключено' : 'База данных не выбрана'">
      <HardDrive :size="17" aria-hidden="true" />
      <div class="sidebar-label">
        <span class="footer-title">На этом устройстве</span>
        <span class="footer-caption">{{ ready ? 'Хранилище подключено' : 'База не выбрана' }}</span>
      </div>
    </div>
  </aside>
</template>
