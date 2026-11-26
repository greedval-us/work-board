<script setup>
import { watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../../app/appStore.js';
import PageHeading from '../../ui/PageHeading.vue';

const store = useAppStore();
const title = useRoute().meta.title;
const router = useRouter();

watchEffect(() => {
  if (store.initialized && !store.databaseSwitching && !store.planningEnabled) {
    void router.replace({ name: 'Registry' });
  }
});
</script>

<template>
  <section v-if="store.planningEnabled" class="page">
    <PageHeading :title="title" />
  </section>
</template>
