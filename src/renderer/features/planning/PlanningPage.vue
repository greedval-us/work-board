<script setup>
import { computed, defineAsyncComponent, useTemplateRef } from 'vue';
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { PLAN_COLUMNS } from '../../../shared/planning.js';
import ControlWorkspace from '../control/ControlWorkspace.vue';
import ControlScopeSwitch from '../control/components/ControlScopeSwitch.vue';
import { useControlWorkspace } from '../control/useControlWorkspace.js';
import { isClosedControl } from '../control/controlLocation.js';
import { useControlRoute } from '../control/useControlRoute.js';
import { planningLocation } from './planningLocation.js';
import { useClosedPlanningStore, usePlanningStore } from './planningStore.js';
import { groupPlans } from './groupPlans.js';
import { usePlanningAccess } from './usePlanningAccess.js';
import { useControlYear } from '../control/year/useControlYear.js';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';
import './planning.css';

const PlanDialog = defineAsyncComponent(() => import('./components/PlanDialog.vue'));
const app = usePlanningAccess();
const route = useRoute();
const router = useRouter();
const closed = computed(() => isClosedControl(route));
const yearCalendar = useControlYear({ app, section: ENTITY_TYPES.PLANS, closed });
const workspace = useTemplateRef('workspace');

function useWorkspace() {
  const store = closed.value ? useClosedPlanningStore() : usePlanningStore();
  const state = useControlWorkspace(app, store, { closed: closed.value });
  const { guardRouteUpdate } = useControlRoute({ app, route, closed: closed.value, routeName: 'PlanningControl', idField: 'plan',
    selected: state.selected, selectedCheckpoint: state.selectedCheckpoint, openRecord: state.openRecord,
    requestClose: () => workspace.value?.requestClose() ?? true });
  onBeforeRouteUpdate(guardRouteUpdate);
  return state;
}

function showClosed(value) {
  if (value !== closed.value) void router.push(planningLocation(value));
}

const labels = {
  all: 'Все планы', add: 'Добавить план', count: 'Подписные номера', found: 'Подписные номера', pageUnit: 'Подписные номера · ',
  unavailable: 'Планы недоступны', noResults: 'Планы не найдены',
  empty: 'Планов пока нет', emptyHelp: 'Добавьте первый план и заполните его пункты.',
  emptyClosed: 'Закрытых планов пока нет', closedHelp: 'Здесь появятся строки планов после закрытия контроля.',
  exportHelp: 'Полный и краткий отчёты учитывают применённые фильтры.',
  confirmClose: record => `Перенести строку плана с подписным номером ${record.instructionNumber} в закрытые планы?`,
};
</script>

<template>
  <ControlWorkspace v-if="app.planningEnabled" :key="closed" ref="workspace" section-title="Контроль планирования"
    :use-workspace="useWorkspace" :year-calendar="yearCalendar" :closed="closed" :record-dialog="PlanDialog" :columns="PLAN_COLUMNS" :labels="labels" :group-rows="groupPlans">
    <template #views>
      <ControlScopeSwitch :closed="closed" closed-label="Закрытые планы" @change="showClosed" />
    </template>
    <template #after-title="{ item }">
      <td data-column="planItem"><span class="registry-cell-summary" :title="item.planItem">{{ item.planItem || '—' }}</span></td>
    </template>
  </ControlWorkspace>
</template>
