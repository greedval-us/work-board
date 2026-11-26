import { getUrgency, INSTRUCTION_STATUS, INSTRUCTION_STATUSES } from '../../../shared/registry.js';
import { formatDate } from '../../../shared/dates.js';
import { getTaskPriorityPresentation } from './taskPriorities.js';

export function calendarDayUrgency(day, today, planningEnabled) {
  const activeChecks = (day.checkpoints ?? 0) - (day.inactiveCheckpoints ?? 0);
  const pendingPlans = (day.plans ?? 0) + (day.planCheckpoints ?? 0) - (day.inactivePlanCheckpoints ?? 0);
  const overduePlans = planningEnabled && day.date < today ? pendingPlans : 0;
  const urgency = day.controls || activeChecks || overduePlans
    ? getUrgency({ deadline: day.date, status: INSTRUCTION_STATUS.PENDING }, today) : null;
  return { activeChecks, overduePlans, urgency };
}

function presentRecord(item, today, completed, detail) {
  const urgency = getUrgency(item, today);
  return { ...item, urgency, secondaryLabel: !completed && urgency.label !== detail ? detail : '' };
}

export function presentControlRecord(item, today) {
  return presentRecord(item, today, item.status === INSTRUCTION_STATUS.COMPLETED, INSTRUCTION_STATUSES[item.status]);
}

export function presentCalendarRecords(instructions, tasks, today) {
  const activeControls = instructions.filter(item => item.status !== INSTRUCTION_STATUS.COMPLETED).length;
  const activeTasks = tasks.filter(item => !item.completed).length;
  return {
    instructions: instructions.map(item => presentControlRecord(item, today)),
    tasks: tasks.map(item => presentRecord(item, today, item.completed, getTaskPriorityPresentation(item.priority).label)),
    counts: { activeControls, completedControls: instructions.length - activeControls, activeTasks, completedTasks: tasks.length - activeTasks },
  };
}

export function presentCalendarCheckpoints(checkpoints, today) {
  let marked = 0;
  const rows = checkpoints.map(item => {
    if (item.mark.trim()) {
      marked += 1;
      const label = item.actualDate && item.actualDate !== item.date ? `Исполнено ${formatDate(item.actualDate)}` : 'Есть отметка';
      return { ...item, urgency: { tone: 'success', label } };
    }
    if (item.recordCompleted) {
      return { ...item, urgency: { tone: 'success', label: item.planId ? 'Пункт плана исполнен' : 'Указание исполнено' } };
    }
    const urgency = getUrgency({ deadline: item.date, status: INSTRUCTION_STATUS.PENDING }, today);
    return { ...item, urgency: urgency.tone === 'info' ? { ...urgency, label: 'По графику' } : urgency };
  });
  return { rows, open: rows.length - marked, marked };
}
