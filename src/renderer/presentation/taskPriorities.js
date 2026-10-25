import { TASK_PRIORITIES, TASK_PRIORITY, TASK_PRIORITY_TONES } from '../../shared/registry.js';

export function getTaskPriorityPresentation(priority, normalTone = TASK_PRIORITY_TONES[TASK_PRIORITY.NORMAL]) {
  return { label: TASK_PRIORITIES[priority], tone: priority === TASK_PRIORITY.NORMAL ? normalTone : TASK_PRIORITY_TONES[priority] };
}
