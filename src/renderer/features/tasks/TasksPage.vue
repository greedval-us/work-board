<script setup>
import { computed, shallowRef } from 'vue';
import { ListTodo, RefreshCw, Repeat2 } from 'lucide-vue-next';
import ActionIcon from '../../ui/ActionIcon.vue';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { formatDate, isDate } from '../../../shared/dates.js';
import { TASK_PRIORITIES, TASK_PRIORITY } from '../../../shared/registry.js';
import { TASK_RECURRENCE_FREQUENCIES } from '../../../shared/taskRecurrence.js';
import { useAppStore } from '../../app/appStore.js';
import PageHeading from '../../ui/PageHeading.vue';
import TaskDialog from '../calendar/components/TaskDialog.vue';
import { useTaskWorkspace } from './useTaskWorkspace.js';
import '../calendar/calendar.css';
import './tasks.css';

const app = useAppStore();
const {
  ready, tasks, loading, error, taskError, busyTaskId, today, month, editing, editor,
  refresh, newTask, editTask, closeTask, saveTask, removeTask, moveTaskOccurrence, toggleTask,
} = useTaskWorkspace({ app });

const filters = { all: 'Все', open: 'В работе', completed: 'Выполненные' };
const status = shallowRef('all');
const filterIndex = computed(() => Object.keys(filters).indexOf(status.value));
const visibleTasks = computed(() => status.value === 'all' ? tasks.value
  : tasks.value.filter(task => task.completed === (status.value === 'completed')));
const showsSeriesOverview = computed(() => !month.value && tasks.value.some(task => task.recurrence));
const emptyMessage = computed(() => {
  if (status.value === 'completed') return 'Выполненных задач пока нет.';
  if (status.value === 'open') return 'Задач в работе нет.';
  return month.value ? 'На этот месяц задач нет.' : 'Добавьте первую задачу.';
});

function changeMonth(event) {
  const value = event.target.value;
  if (!value || isDate(`${value}-01`)) month.value = value;
  else event.target.value = month.value;
}

function changeCompletion(event, task) {
  event.target.checked = task.completed;
  void toggleTask(task);
}
</script>

<template>
  <section class="page tasks-page">
    <header class="tasks-toolbar">
      <div class="tasks-title">
        <PageHeading title="Задачи" />
        <span v-if="ready && !loading && !error" class="tasks-count" :aria-label="`Задач в списке: ${visibleTasks.length}`">{{ visibleTasks.length }}</span>
      </div>
      <button v-if="ready" type="button" class="calendar-button calendar-button-primary" :disabled="app.databaseSwitching" @click="newTask">
        <ActionIcon name="create" :size="17" /> Новая задача
      </button>
    </header>

    <div v-if="!ready" class="tasks-empty tasks-no-database">
      <span class="empty-icon"><ListTodo :size="28" aria-hidden="true" /></span>
      <h2>Выберите базу данных</h2>
      <p>{{ app.database?.message || 'Откройте или создайте базу данных, чтобы работать с задачами.' }}</p>
      <RouterLink class="calendar-button calendar-button-primary" to="/settings">Открыть настройки</RouterLink>
    </div>

    <section v-else class="tasks-workspace" aria-label="Список задач">
      <div class="tasks-filters">
        <div class="tasks-status-filter" role="group" aria-label="Статус задач" :style="{ '--filter-index': filterIndex }">
          <button v-for="(label, value) in filters" :key="value" type="button" :aria-pressed="status === value" @click="status = value">
            {{ label }}
          </button>
        </div>
        <div class="tasks-month-filter">
          <label>
            <span>Месяц</span>
            <input name="task-list-month" type="month" :value="month" :min="DATE_LIMITS.MIN.slice(0, 7)" :max="DATE_LIMITS.MAX.slice(0, 7)"
              @change="changeMonth" />
          </label>
          <button v-if="month" type="button" class="calendar-button" @click="month = ''">Все даты</button>
        </div>
      </div>
      <div class="tasks-results" role="region" aria-label="Задачи по выбранным фильтрам" tabindex="0" :aria-busy="loading">
        <div v-if="error" class="tasks-error" role="alert">
          <p>{{ error }}</p>
          <button type="button" class="calendar-button" @click="refresh"><RefreshCw :size="15" aria-hidden="true" /> Повторить</button>
        </div>
        <p v-if="taskError" class="tasks-error" role="alert">{{ taskError }}</p>
        <p v-if="loading && !tasks.length" class="tasks-empty" role="status">Загружаем задачи…</p>
        <div v-else-if="!error && !visibleTasks.length" class="tasks-empty" role="status">
          <ListTodo :size="26" :stroke-width="1.5" aria-hidden="true" />
          <p>{{ emptyMessage }}</p>
        </div>
        <ul v-if="visibleTasks.length" class="tasks-list">
          <li v-for="task in visibleTasks" :key="`${task.id}:${task.date}`" class="task-row" :class="{ 'task-row-completed': task.completed }"
            :data-task-id="task.id" :data-task-date="task.date">
            <input type="checkbox" class="task-row-check" :checked="task.completed" :disabled="loading || app.databaseSwitching || busyTaskId !== null"
              :aria-label="`${task.completed ? 'Вернуть в работу' : 'Отметить выполненной'}: ${task.title}${task.recurrence ? `, ${formatDate(task.date)}` : ''}`"
              @change="changeCompletion($event, task)" />
            <div class="task-row-main">
              <button type="button" class="task-row-title" :disabled="loading || app.databaseSwitching || busyTaskId === task.id" @click="editTask(task)">
                {{ task.title }}
              </button>
              <span v-if="task.description" class="task-row-description">{{ task.description }}</span>
            </div>
            <div class="task-row-meta">
              <span v-if="task.recurrence" class="task-row-recurrence"><Repeat2 :size="15" aria-hidden="true" />{{ TASK_RECURRENCE_FREQUENCIES[task.recurrence.frequency] }}</span>
              <span v-if="task.priority !== TASK_PRIORITY.NORMAL" class="task-row-priority" :class="`task-priority-${task.priority}`">{{ TASK_PRIORITIES[task.priority] }}</span>
              <time :datetime="task.date">{{ formatDate(task.date) }}</time>
              <span v-if="!task.completed && task.date <= today" class="task-row-due" :class="{ 'task-row-overdue': task.date < today }">
                {{ task.date < today ? 'Просрочено' : 'Сегодня' }}
              </span>
            </div>
          </li>
        </ul>
        <p v-if="showsSeriesOverview" class="tasks-list-help">Показано по одному повторению каждой серии. Выберите месяц, чтобы увидеть все повторения за этот месяц.</p>
      </div>
    </section>

    <TaskDialog v-if="editing" :key="`${editing.generation}:${editing.task?.id ?? 'new'}:${editing.date}`" ref="editor"
      :task="editing.task" :date="editing.date" :generation="editing.generation" :save-task="saveTask"
      :remove-task="removeTask" :move-task-occurrence="moveTaskOccurrence" @close="closeTask" />
  </section>
</template>
