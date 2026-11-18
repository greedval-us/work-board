<script setup>
import RegistryWorkspace from '../components/registry/RegistryWorkspace.vue';
import '../styles/registry.css';

defineProps({ closed: Boolean });
</script>

<template>
  <section class="page registry-page">
    <RegistryWorkspace :closed="closed" />
  </section>
</template>
