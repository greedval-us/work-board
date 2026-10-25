<script setup>
import { computed } from 'vue';
import { ArrowUpRight, Check, Plus } from 'lucide-vue-next';
import { getUrgency, INSTRUCTION_STATUSES, TASK_PRIORITIES } from '../../../shared/registry.js';
import { dayLabel } from '../../domain/calendarDates.js';

const props = defineProps({
  date: { type: String, required: true }, instructions: { type: Array, required: true }, tasks: { type: Array, required: true },
  today: { type: String, required: true }, loading: Boolean, error: { type: String, default: '' },
  taskError: { type: String, default: '' }, busyTaskId: { default: null }, disabled: Boolean,
});
const emit = defineEmits(['newTask', 'openTask', 'toggleTask', 'retry']);
const title = computed(() => dayLabel(props.date));
const instructionRows = computed(() => props.instructions.map((item) => ({ ...item, urgency: getUrgency(item, props.today) })));
const taskRows = computed(() => props.tasks.map((item) => ({ ...item, urgency: getUrgency(item, props.today) })));
const activeControls = computed(() => props.instructions.filter((item) => item.status !== 'completed').length);
const completedControls = computed(() => props.instructions.length - activeControls.value);
const activeTasks = computed(() => props.tasks.filter((item) => !item.completed).length);
const completedTasks = computed(() => props.tasks.length - activeTasks.value);

function toggleTask(event, item) {
  // Commit the visual check only after SQLite confirms the change.
  event.target.checked = item.completed;
  emit('toggleTask', item);
}
</script>

<template>
  <section class="calendar-day-panel" :aria-busy="loading" aria-labelledby="calendar-day-heading">
    <header class="calendar-day-heading"><h2 id="calendar-day-heading">{{ title }}</h2></header>
    <p v-if="loading" class="calendar-day-placeholder" role="status">Загружаем записи…</p>
    <div v-else-if="error" class="calendar-alert" role="alert"><p>{{ error }}</p><button class="calendar-button" @click="emit('retry')">Повторить</button></div>
    <template v-else>
      <section class="calendar-day-section" aria-labelledby="calendar-controls-heading">
        <div class="calendar-list-heading"><h3 id="calendar-controls-heading">Указания</h3><span class="calendar-list-count" :aria-label="`На контроле: ${activeControls}`">{{ activeControls }}</span><span v-if="completedControls" class="calendar-completed-count" :aria-label="`Исполнено: ${completedControls}`" :title="`Исполнено: ${completedControls}`"><Check :size="12" aria-hidden="true" />{{ completedControls }}</span></div>
        <div class="calendar-list-body" tabindex="0" role="region" aria-label="Указания на выбранный день">
        <p v-if="!instructionRows.length" class="calendar-empty-list">Указаний к этому сроку нет.</p>
        <ul v-else class="calendar-record-list">
          <li v-for="item in instructionRows" :key="item.id">
            <RouterLink class="calendar-instruction-card" :to="{ path: '/', query: { instruction: item.id } }">
              <span class="calendar-record-number">№ {{ item.instructionNumber }} <ArrowUpRight :size="15" aria-hidden="true" /></span>
              <strong :title="item.title">{{ item.title }}</strong><span class="calendar-record-secondary" :title="item.executor">{{ item.executor }}</span>
              <span class="calendar-record-meta"><span class="calendar-badge" :class="`calendar-tone-${item.urgency.tone}`">{{ item.urgency.label }}</span><span v-if="item.status !== 'completed' && item.urgency.label !== INSTRUCTION_STATUSES[item.status]">{{ INSTRUCTION_STATUSES[item.status] }}</span></span>
            </RouterLink>
          </li>
        </ul>
        </div>
      </section>
      <section class="calendar-day-section" aria-labelledby="calendar-tasks-heading">
        <div class="calendar-list-heading"><h3 id="calendar-tasks-heading">Мои задачи</h3><span class="calendar-list-count" :aria-label="`Невыполненных задач: ${activeTasks}`">{{ activeTasks }}</span><span v-if="completedTasks" class="calendar-completed-count" :aria-label="`Выполнено: ${completedTasks}`" :title="`Выполнено: ${completedTasks}`"><Check :size="12" aria-hidden="true" />{{ completedTasks }}</span><button class="calendar-add-task" :disabled="disabled" aria-label="Добавить задачу на выбранный день" @click="emit('newTask')"><Plus :size="17" aria-hidden="true" /></button></div>
        <div class="calendar-list-body" tabindex="0" role="region" aria-label="Задачи на выбранный день">
        <p v-if="taskError" class="calendar-task-error" role="alert">{{ taskError }}</p>
        <p v-if="!taskRows.length" class="calendar-empty-list">Пока свободно. Добавьте задачу на этот день.</p>
        <ul v-else class="calendar-record-list">
          <li v-for="item in taskRows" :key="item.id" class="calendar-task-card" :class="{ 'calendar-task-completed': item.completed }">
            <input type="checkbox" class="calendar-task-checkbox" :checked="item.completed" :disabled="disabled || busyTaskId !== null" :aria-label="`${item.completed ? 'Вернуть в работу' : 'Отметить выполненной'}: ${item.title}`" @change="toggleTask($event, item)" />
            <button class="calendar-task-open" :disabled="disabled || busyTaskId === item.id" @click="emit('openTask', item)">
              <strong :title="item.title">{{ item.title }}</strong><span v-if="item.description" class="calendar-record-secondary calendar-task-description">{{ item.description }}</span>
              <span class="calendar-record-meta"><span class="calendar-badge" :class="`calendar-tone-${item.urgency.tone}`">{{ item.urgency.label }}</span><span v-if="!item.completed && item.urgency.label !== TASK_PRIORITIES[item.priority]">{{ TASK_PRIORITIES[item.priority] }}</span></span>
            </button>
          </li>
        </ul>
        </div>
      </section>
    </template>
  </section>
</template>
