<script setup>
import { PanelsTopLeft } from 'lucide-vue-next';
</script>

<template>
  <div class="workspace-empty">
    <span class="empty-icon"><PanelsTopLeft :size="42" :stroke-width="1.3" aria-hidden="true" /></span>
    <h2>Здесь пока ничего нет</h2>
    <p>Ваши материалы появятся в этом пространстве.</p>
  </div>
</template>
