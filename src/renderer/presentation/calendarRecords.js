import { getUrgency, INSTRUCTION_STATUS, INSTRUCTION_STATUSES } from '../../shared/registry.js';
import { getTaskPriorityPresentation } from './taskPriorities.js';

function presentRecord(item, today, completed, detail) {
  const urgency = getUrgency(item, today);
  return { ...item, urgency, secondaryLabel: !completed && urgency.label !== detail ? detail : '' };
}

export function presentCalendarRecords(instructions, tasks, today) {
  const activeControls = instructions.filter(item => item.status !== INSTRUCTION_STATUS.COMPLETED).length;
  const activeTasks = tasks.filter(item => !item.completed).length;
  return {
    instructions: instructions.map(item => presentRecord(item, today, item.status === INSTRUCTION_STATUS.COMPLETED, INSTRUCTION_STATUSES[item.status])),
    tasks: tasks.map(item => presentRecord(item, today, item.completed, getTaskPriorityPresentation(item.priority).label)),
    counts: { activeControls, completedControls: instructions.length - activeControls, activeTasks, completedTasks: tasks.length - activeTasks },
  };
}
