import { daysInMonth, validateDate, ValidationError } from '../../shared/registry.js';

export class CalendarService {
  constructor(instructions, tasks) {
    this.instructions = instructions;
    this.tasks = tasks;
  }

  month(request = {}) {
    const month = request?.month;
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('Выберите корректный месяц.');
    const from = validateDate(`${month}-01`, 'Месяц');
    const [year, number] = month.split('-').map(Number);
    const count = daysInMonth(year, number);
    const to = `${month}-${String(count).padStart(2, '0')}`;
    const days = Array.from({ length: count }, (_, index) => ({
      date: `${month}-${String(index + 1).padStart(2, '0')}`,
      controls: 0, completedControls: 0, tasks: 0, completedTasks: 0,
    }));
    const byDate = new Map(days.map(day => [day.date, day]));
    for (const instruction of this.instructions.all({ filters: { deadlineFrom: from, deadlineTo: to } })) {
      const key = instruction.status === 'completed' ? 'completedControls' : 'controls';
      byDate.get(instruction.deadline)[key] += 1;
    }
    for (const task of this.tasks.list({ from, to })) {
      const key = task.completed ? 'completedTasks' : 'tasks';
      byDate.get(task.date)[key] += 1;
    }
    return { days };
  }

  day(request = {}) {
    const date = request?.date;
    validateDate(date);
    return {
      instructions: this.instructions.all({ filters: { deadlineFrom: date, deadlineTo: date } }),
      tasks: this.tasks.list({ from: date, to: date }),
    };
  }
}
