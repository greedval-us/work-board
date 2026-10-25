<script setup>
import { onBeforeUnmount, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { CalendarDays, Plus, RefreshCw } from 'lucide-vue-next';
import PageHeading from '../ui/PageHeading.vue';
import MonthCalendar from './MonthCalendar.vue';
import CalendarDayLists from './CalendarDayLists.vue';
import TaskDialog from './TaskDialog.vue';
import { useCalendar } from '../../composables/useCalendar.js';
import { useAppStore } from '../../stores/appStore.js';

const app = useAppStore();
const calendar = useCalendar();
const {
  today, month, selectedDate, grid, instructions, tasks, ready, generation,
  monthLoading, dayLoading, monthError, dayError, taskError, busyTaskId,
} = calendar;
const editing = shallowRef(null);
const editor = shallowRef(null);

function newTask() { editing.value = { task: null, date: selectedDate.value, generation: generation.value }; }
function editTask(task) { editing.value = { task, date: task.date, generation: generation.value }; }
function canLeave() { return editor.value?.requestClose() ?? true; }

onBeforeRouteLeave(canLeave);
const unregister = app.registerUnsavedGuard(canLeave);
watch(generation, () => { editing.value = null; });
onBeforeUnmount(unregister);
</script>

<template>
  <section class="page calendar-page">
    <div class="calendar-page-heading">
      <PageHeading title="Календарь и задачи" />
      <button v-if="ready" class="calendar-button calendar-button-primary" :disabled="app.databaseSwitching" @click="newTask">
        <Plus :size="17" aria-hidden="true" /> Новая задача
      </button>
    </div>

    <div v-if="!ready" class="calendar-no-database">
      <span class="empty-icon"><CalendarDays :size="36" aria-hidden="true" /></span>
      <h2>Выберите базу данных</h2>
      <p>{{ app.database?.message || 'Создайте новую базу или откройте существующую, чтобы видеть сроки и сохранять задачи.' }}</p>
      <RouterLink class="calendar-button calendar-button-primary" to="/settings">Открыть настройки</RouterLink>
    </div>

    <template v-else>
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
          :date="selectedDate" :instructions="instructions" :tasks="tasks" :today="today" :loading="dayLoading"
          :error="dayError" :task-error="taskError" :busy-task-id="busyTaskId" :disabled="app.databaseSwitching"
          @new-task="newTask" @open-task="editTask" @toggle-task="calendar.toggleTask" @retry="calendar.fetchDay"
        />
      </div>
    </template>

    <TaskDialog
      v-if="editing" ref="editor" :task="editing.task" :date="editing.date" :generation="editing.generation"
      :save-task="calendar.saveTask" :remove-task="calendar.removeTask" @close="editing = null"
    />
  </section>
</template>
