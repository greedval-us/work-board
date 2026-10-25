<script setup>
import icon from '../../../public/icons/app.svg';
defineProps({ size: { type: Number, default: 34 } });
</script>

<template>
  <img :src="icon" :width="size" :height="size" class="app-icon" alt="" aria-hidden="true" draggable="false" />
</template>

<style scoped>
.app-icon { display: block; flex-shrink: 0; object-fit: contain; }
</style>
