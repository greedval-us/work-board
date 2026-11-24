<script setup>
import { computed } from 'vue';
import { Bell, Download, FolderOpen, Plus, SlidersHorizontal } from 'lucide-vue-next';
import { useAppStore } from '../app/appStore.js';
import { actionIconPaths } from './actionIconPaths.js';

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
});
const standardIcons = { create: Plus, export: Download, filter: SlidersHorizontal, open: FolderOpen, notify: Bell };
const app = useAppStore();
const path = computed(() => actionIconPaths[app.appearanceStyle]?.[props.name]);
</script>

<template>
  <svg v-if="path" :data-action-icon="name" :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" :stroke-linejoin="app.appearanceStyle === 'cyberpunk' ? 'bevel' : 'round'"
    stroke-linecap="round" aria-hidden="true" focusable="false"><path :d="path" /></svg>
  <component :is="standardIcons[name]" v-else :size="size" :data-action-icon="name" aria-hidden="true" />
</template>
