<script setup>
import { computed, defineAsyncComponent, useTemplateRef } from 'vue';
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { INSTRUCTION_COLUMNS } from '../../../shared/registry.js';
import { useAppStore } from '../../app/appStore.js';
import ControlWorkspace from '../control/ControlWorkspace.vue';
import ControlScopeSwitch from '../control/components/ControlScopeSwitch.vue';
import { isClosedRegistry, registryLocation } from './registryLocation.js';
import { useRegistry } from './useRegistry.js';
import { useRegistryRoute } from './useRegistryRoute.js';
import { useControlYear } from '../control/year/useControlYear.js';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';

const InstructionDialog = defineAsyncComponent(() => import('./components/InstructionDialog.vue'));
const route = useRoute();
const router = useRouter();
const app = useAppStore();
const closed = computed(() => isClosedRegistry(route));
const yearCalendar = useControlYear({ app, section: ENTITY_TYPES.INSTRUCTIONS, closed });
const workspace = useTemplateRef('workspace');

function useWorkspace() {
  const scope = { closed: closed.value };
  const state = useRegistry(undefined, undefined, scope);
  const navigation = useRegistryRoute({ app, route, ...scope, selected: state.selected,
    selectedCheckpoint: state.selectedCheckpoint, openRecord: state.openRecord,
    requestClose: () => workspace.value?.requestClose() ?? true });
  onBeforeRouteUpdate(navigation.guardRouteUpdate);
  return state;
}

function showClosed(value) {
  if (value !== closed.value) void router.push(registryLocation(value));
}

const labels = {
  all: 'Все указания', count: 'Все указания', found: 'Найдено', add: 'Добавить указание',
  unavailable: 'Реестр недоступен', noResults: 'Указания не найдены',
  empty: 'В реестре пока нет указаний', emptyHelp: 'Добавьте первое указание — его срок появится в календаре.',
  emptyClosed: 'Закрытых указаний пока нет', closedHelp: 'Здесь появятся указания после закрытия контроля.',
  exportHelp: 'Полный и краткий отчёты учитывают применённые фильтры. В кратком отчёте восемь столбцов.',
  confirmClose: record => `Указание с подписным номером ${record.instructionNumber} будет перенесено в раздел «Закрытый контроль».`,
};
</script>

<template>
  <ControlWorkspace :key="closed" ref="workspace" section-title="Реестр контроля"
    :use-workspace="useWorkspace" :year-calendar="yearCalendar" :record-dialog="InstructionDialog" :closed="closed" :columns="INSTRUCTION_COLUMNS" :labels="labels">
    <template #views>
      <ControlScopeSwitch :closed="closed" closed-label="Закрытый контроль" @change="showClosed" />
    </template>
  </ControlWorkspace>
</template>
