<script setup>
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { CalendarDays, RefreshCw } from 'lucide-vue-next';
import ActionIcon from '../../ui/ActionIcon.vue';
import PageHeading from '../../ui/PageHeading.vue';
import MonthCalendar from './components/MonthCalendar.vue';
import CalendarDayLists from './components/CalendarDayLists.vue';
import TaskDialog from './components/TaskDialog.vue';
import { useCalendar } from './useCalendar.js';
import { useCalendarTaskRoute } from './useCalendarTaskRoute.js';
import { useAppStore } from '../../app/appStore.js';
import './calendar.css';

const app = useAppStore();
const route = useRoute();
const calendar = useCalendar();
const {
  today, month, selectedDate, grid, instructions, tasks, checkpoints, ready, generation,
  monthLoading, dayLoading, monthError, dayError, taskError, busyTaskId,
} = calendar;
const editing = shallowRef(null);
const editor = shallowRef(null);

function newTask() { taskNavigation.cancelPending(); editing.value = { task: null, date: selectedDate.value, generation: generation.value }; }
function editTask(task) { taskNavigation.cancelPending(); editing.value = { task, date: task.date, generation: generation.value }; }
function closeTask(nextDate) {
  taskNavigation.cancelPending();
  editing.value = null;
  if (nextDate) calendar.selectDate(nextDate);
}
function canLeave() { return editor.value?.requestClose() ?? true; }
const taskNavigation = useCalendarTaskRoute({ app, route, calendar, editing, requestClose: canLeave });
const { error: navigationError, loading: openingTask } = taskNavigation;

onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(taskNavigation.guardRouteUpdate);
const unregister = app.registerUnsavedGuard(canLeave);
watch(generation, () => { editing.value = null; });
onBeforeUnmount(unregister);
</script>

<template>
  <section class="page calendar-page">
    <div class="calendar-page-heading">
      <PageHeading title="Календарь и задачи" />
      <button v-if="ready" class="calendar-button calendar-button-primary" :disabled="app.databaseSwitching" @click="newTask">
        <ActionIcon name="create" :size="17" /> Новая задача
      </button>
    </div>

    <div v-if="!ready" class="calendar-no-database">
      <span class="empty-icon"><CalendarDays :size="36" aria-hidden="true" /></span>
      <h2>Выберите базу данных</h2>
      <p>{{ app.database?.message || 'Создайте новую базу или откройте существующую, чтобы видеть сроки и сохранять задачи.' }}</p>
      <RouterLink class="calendar-button calendar-button-primary" to="/settings">Открыть настройки</RouterLink>
    </div>

    <template v-else>
      <p v-if="openingTask" role="status">Открытие задачи…</p>
      <div v-if="monthError" class="calendar-alert" role="alert">
        <p>{{ monthError }}</p>
        <button class="calendar-button" @click="calendar.fetchMonth"><RefreshCw :size="15" aria-hidden="true" /> Повторить</button>
      </div>
      <div class="calendar-layout">
        <MonthCalendar
          :month="month" :days="grid" :selected-date="selectedDate" :today="today" :loading="monthLoading"
          @change-month="calendar.changeMonth" @select-date="calendar.selectDate" @today="calendar.goToday"
        />
        <CalendarDayLists
          :date="selectedDate" :instructions="instructions" :tasks="tasks" :checkpoints="checkpoints" :today="today" :loading="dayLoading"
          :error="dayError" :task-error="navigationError || taskError" :busy-task-id="busyTaskId" :disabled="app.databaseSwitching"
          @new-task="newTask" @open-task="editTask" @toggle-task="calendar.toggleTask" @retry="calendar.fetchDay"
        />
      </div>
    </template>

    <TaskDialog
      v-if="editing" :key="`${editing.generation}:${editing.task?.id ?? 'new'}:${editing.date}`" ref="editor" :task="editing.task" :date="editing.date" :generation="editing.generation"
      :save-task="calendar.saveTask" :remove-task="calendar.removeTask" :move-task-occurrence="calendar.moveTaskOccurrence" @close="closeTask"
    />
  </section>
</template>
