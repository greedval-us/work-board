<script setup>
import PageHeading from '../components/ui/PageHeading.vue';
import WorkspaceEmpty from '../components/home/WorkspaceEmpty.vue';
</script>

<template>
  <section class="page workspace-page">
    <PageHeading title="Рабочее пространство" description="Всё необходимое — на вашем устройстве." />
    <WorkspaceEmpty />
  </section>
</template>
