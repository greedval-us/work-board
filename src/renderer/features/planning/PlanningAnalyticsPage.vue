<script setup>
import AnalyticsPage from '../analytics/AnalyticsPage.vue';
import { usePlanningAccess } from './usePlanningAccess.js';
const app = usePlanningAccess();
</script>

<template>
  <AnalyticsPage v-if="app.planningEnabled" planning />
</template>
