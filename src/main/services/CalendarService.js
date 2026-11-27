import { daysInMonth, instructionDeadline, validateDate, ValidationError } from '../../shared/registry.js';
import { ISO_MONTH_PATTERN } from '../../shared/constants/dates.js';
import { INSTRUCTION_STATUS } from '../../shared/constants/registry.js';
import { listControlCheckpoints } from '../../shared/controlSchedule.js';

const registryCounts = { open: 'controls', completed: 'completedControls', checks: 'checkpoints',
  marked: 'completedCheckpoints', inactive: 'inactiveCheckpoints' };
const planCounts = { open: 'plans', completed: 'completedPlans', checks: 'planCheckpoints',
  marked: 'completedPlanCheckpoints', inactive: 'inactivePlanCheckpoints' };

function deadlines(repository, from, to) {
  return repository.all({ filters: { deadlineFrom: from, deadlineTo: to } });
}

function* checkpoints(repository, from, to) {
  for (const record of repository.scheduledForCalendar()) {
    const { id, title, instructionNumber, executor, controlSchedule } = record;
    const identity = Object.hasOwn(record, 'planItem')
      ? { planId: id, planItem: record.planItem, activity: record.activity }
      : { instructionId: id };
    for (const checkpoint of listControlCheckpoints(controlSchedule, { from, to, deadline: instructionDeadline(record) })) {
      yield { ...checkpoint, ...identity, title, instructionNumber, executor,
        ...(record.status === INSTRUCTION_STATUS.COMPLETED && { recordCompleted: true }) };
    }
  }
}

function countControls(byDate, repository, from, to, counts) {
  for (const item of deadlines(repository, from, to)) {
    const key = item.status === INSTRUCTION_STATUS.COMPLETED ? counts.completed : counts.open;
    byDate.get(instructionDeadline(item))[key] += 1;
  }
  for (const item of checkpoints(repository, from, to)) {
    const day = byDate.get(item.date);
    const marked = Boolean(item.mark.trim());
    day[marked ? counts.marked : counts.checks] += 1;
    if (!marked && item.recordCompleted) day[counts.inactive] = (day[counts.inactive] ?? 0) + 1;
  }
}

export class CalendarService {
  constructor(instructions, tasks, { plans, isPlanningEnabled = () => false } = {}) {
    this.instructions = instructions;
    this.tasks = tasks;
    this.plans = plans;
    this.isPlanningEnabled = isPlanningEnabled;
  }

  year(request) {
    const { section, year, closed } = request ?? {};
    if (section !== 'instructions' && section !== 'plans') throw new ValidationError('Выберите раздел контроля.');
    if (typeof closed !== 'boolean') throw new ValidationError('Выберите активный или закрытый контроль.');
    if (!Number.isInteger(year) || year < 1 || year > 9999) throw new ValidationError('Выберите год от 1 до 9999.');
    if (section === 'plans' && !this.isPlanningEnabled()) return { events: [] };

    const prefix = String(year).padStart(4, '0');
    const from = `${prefix}-01-01`;
    const to = `${prefix}-12-31`;
    const repository = section === 'plans' ? this.plans : this.instructions;
    const events = [];
    for (const { deadline, status, controlSchedule, ...record } of repository.calendarRecords({ from, to, closed })) {
      if (deadline >= from && deadline <= to) {
        events.push({ ...record, date: deadline, kind: 'deadline', completed: closed || status === INSTRUCTION_STATUS.COMPLETED });
      }
      if (!controlSchedule) continue;
      const schedule = JSON.parse(controlSchedule);
      const visible = closed ? { marks: schedule.marks } : schedule;
      for (const checkpoint of listControlCheckpoints(visible, { from, to, deadline })) {
        events.push({ ...record, date: checkpoint.date, kind: 'checkpoint', completed: Boolean(checkpoint.mark),
          ...(status === INSTRUCTION_STATUS.COMPLETED ? { recordCompleted: true } : {}) });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    return { events };
  }

  month(request = {}) {
    const month = request?.month;
    if (typeof month !== 'string' || !ISO_MONTH_PATTERN.test(month)) throw new ValidationError('Выберите корректный месяц.');
    const from = validateDate(`${month}-01`, 'Месяц');
    const [year, number] = month.split('-').map(Number);
    const count = daysInMonth(year, number);
    const to = `${month}-${String(count).padStart(2, '0')}`;
    const planning = this.isPlanningEnabled();
    const days = Array.from({ length: count }, (_, index) => ({
      date: `${month}-${String(index + 1).padStart(2, '0')}`,
      controls: 0, completedControls: 0, tasks: 0, completedTasks: 0, checkpoints: 0, completedCheckpoints: 0,
      ...(planning ? { plans: 0, completedPlans: 0, planCheckpoints: 0, completedPlanCheckpoints: 0 } : {}),
    }));
    const byDate = new Map(days.map(day => [day.date, day]));
    countControls(byDate, this.instructions, from, to, registryCounts);
    if (planning) {
      countControls(byDate, this.plans, from, to, planCounts);
    }
    for (const task of this.tasks.occurrences({ from, to })) {
      const key = task.completed ? 'completedTasks' : 'tasks';
      byDate.get(task.date)[key] += 1;
    }
    return { days };
  }

  day(request = {}) {
    const date = request?.date;
    validateDate(date);
    return {
      instructions: deadlines(this.instructions, date, date),
      tasks: this.tasks.occurrences({ from: date, to: date }),
      checkpoints: [...checkpoints(this.instructions, date, date)],
      ...(this.isPlanningEnabled() ? {
        plans: deadlines(this.plans, date, date),
        planCheckpoints: [...checkpoints(this.plans, date, date)],
      } : {}),
    };
  }
}
