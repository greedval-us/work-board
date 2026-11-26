import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { PlanRepository } from '../../src/main/repositories/PlanRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { NotificationStateRepository } from '../../src/main/repositories/NotificationStateRepository.js';
import { NotificationService } from '../../src/main/services/NotificationService.js';
import { BusinessHandler } from '../../src/main/ipc/BusinessHandler.js';
import { IPCManager } from '../../src/main/ipc/IPCManager.js';
import { SettingsRepository } from '../../src/main/repositories/SettingsRepository.js';
import { SettingsService } from '../../src/main/services/SettingsService.js';
import { CalendarService } from '../../src/main/services/CalendarService.js';
import { RecordService } from '../../src/main/services/RecordService.js';
import { PlanningService } from '../../src/main/services/PlanningService.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-notifications-'));
  const filePath = path.join(directory, 'first.sqlite');
  const database = new DatabaseService({ filePath });
  database.open();
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const instructions = new InstructionRepository(database);
  const plans = new PlanRepository(database);
  const settings = new SettingsRepository(database);
  const tasks = new TaskRepository(database);
  let today = '2026-11-12';
  const service = new NotificationService({
    instructions, tasks, plans, isPlanningEnabled: () => settings.isPlanningEnabled(),
    repository: new NotificationStateRepository(database), today: () => today,
  });
  const instruction = changes => instructions.create({
    controlDate: '2026-10-01', instructionNumber: '12/А', title: 'Указание',
    executor: 'Иванов', deadline: '2026-11-12', ...changes,
  });
  return { database, directory, filePath, instructions, tasks, plans, service, instruction, setToday: value => { today = value; } };
}

const reference = item => ({ id: item.id, occurrence: item.occurrence });

test('planning reminders keep separate receipts and follow moves, marks, closure and the planning setting', t => {
  const { database, plans, instruction, service } = fixture(t);
  const settings = new SettingsRepository(database);
  const original = instruction({ controlSchedule: { frequency: 'custom', customDates: ['2026-11-12'] } });
  const row = plans.create({ ...original, planItem: 'п. 3', extendedUntil: '2026-11-15' });
  database.connection.prepare('UPDATE plans SET created_at = ? WHERE id = ?').run(original.createdAt, row.id);
  assert.deepEqual(service.list().items.map(item => item.kind), ['checkpoint', 'instruction']);
  settings.savePlanningEnabled(true);
  const all = service.list().items;
  assert.equal(new Set(all.map(item => item.id)).size, 4);
  const due = all.find(item => item.kind === 'plan');
  const checkpoint = all.find(item => item.kind === 'planCheckpoint');
  assert.deepEqual([due.date, checkpoint.date, checkpoint.planItem], ['2026-11-15', '2026-11-12', 'п. 3']);
  assert.equal(due.recordId, original.id);
  service.acknowledge({ items: [due, checkpoint], read: true, popup: true });
  settings.savePlanningEnabled(false);
  service.acknowledge({ items: [], read: true });
  assert.ok(service.list().items.every(item => item.unread && item.popupPending));
  settings.savePlanningEnabled(true);
  assert.ok(service.list().items.filter(item => item.planItem).every(item => !item.unread && !item.popupPending));
  plans.update(row.id, { controlSchedule: { ...row.controlSchedule, moves: [{ from: '2026-11-12', to: '2026-11-13' }] } });
  const moved = service.list().items.find(item => item.kind === 'planCheckpoint');
  assert.equal(moved.id, checkpoint.id);
  assert.equal(moved.date, '2026-11-13');
  assert.equal(moved.popupPending, true);
  plans.update(row.id, { controlSchedule: { ...plans.get(row.id).controlSchedule, marks: [{ date: moved.date, text: 'Исполнено' }] } });
  assert.equal(service.list().items.some(item => item.kind === 'planCheckpoint'), false);
  plans.closeControl(row.id);
  assert.deepEqual(service.list().items.map(item => item.kind), ['checkpoint', 'instruction']);
});

test('closing a control via IPC removes its deadline and checkpoints from the calendar and reminders', async t => {
  const { database, instructions, tasks, service, instruction } = fixture(t);
  const item = instruction({ controlSchedule: { frequency: 'daily', firstDate: '2026-11-11' } });
  const calendar = new CalendarService(instructions, tasks);
  const task = tasks.create({ title: 'Независимая задача', date: '2026-11-12' });
  const handlers = new Map();
  const window = { isDestroyed: () => false, webContents: { mainFrame: {} } };
  const reminderSnapshots = [];
  const manager = new IPCManager({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
    database, appService: { getInfo: () => ({}) }, settingsService: new SettingsService(new SettingsRepository(database)),
    recordServices: { instructions: new RecordService({ database, repository: instructions }) },
    calendar, notifications: service, getWindow: () => window, logger: { error() {} },
    onDataChanged: () => reminderSnapshots.push(service.list().items.map(row => row.kind)),
  });
  manager.init(); t.after(() => manager.shutdown());
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const generation = database.getStatus().generation;
  const request = { id: item.id, generation };
  const close = handlers.get('instructions:close-control');
  assert.equal(typeof close, 'function');
  assert.equal((await close(event, { ...request, generation: generation - 1 })).error.code, 'DATABASE_CHANGED');
  assert.deepEqual(reminderSnapshots, []);
  const day = { date: '2026-11-12' };
  const month = { month: '2026-11' };
  assert.equal(calendar.month(month).days[11].controls, 1);
  assert.equal(calendar.day(day).checkpoints.length, 1);
  assert.deepEqual(new Set(service.list().items.map(row => row.kind)), new Set(['checkpoint', 'instruction', 'task']));

  assert.equal((await close(event, request)).ok, true);
  assert.deepEqual(reminderSnapshots, [['task']]);
  assert.deepEqual(calendar.day(day), { instructions: [], checkpoints: [], tasks: [task] });
  assert.equal(calendar.month(month).days[11].controls, 0);
  assert.equal(calendar.month(month).days[11].checkpoints, 0);
});

test('notifications include overdue and the inclusive three-day horizon using the effective deadline', t => {
  const f = fixture(t);
  const overdue = f.instruction({ title: 'Просрочено', deadline: '2026-11-11', status: 'in_progress' });
  const extended = f.instruction({ title: 'Продлено', deadline: '2026-11-01', extendedUntil: '2026-11-15' });
  f.instruction({ title: 'Не скоро', extendedUntil: '2026-11-16' });
  f.instruction({ title: 'Исполнено', status: 'completed' });
  const today = f.tasks.create({ title: 'Сегодня', date: '2026-11-12' });
  const boundary = f.tasks.create({ title: 'Через три дня', date: '2026-11-15' });
  f.tasks.create({ title: 'Через четыре дня', date: '2026-11-16' });
  f.tasks.create({ title: 'Готово', date: '2026-11-10', completed: true });

  const result = f.service.list();
  assert.equal(result.today, '2026-11-12');
  assert.deepEqual(result.items.map(item => [item.kind, item.recordId, item.date]), [
    ['instruction', overdue.id, '2026-11-11'], ['task', today.id, '2026-11-12'],
    ['instruction', extended.id, '2026-11-15'], ['task', boundary.id, '2026-11-15'],
  ]);
  assert.ok(result.items.every(item => item.unread && item.popupPending));
  assert.equal(result.items[0].occurrence, '2026-11-11:2026-11-12');
  assert.equal(result.items[0].instructionNumber, '12/А');
});

test('enabling planning and mutating plan rows refreshes reminders immediately through IPC', async t => {
  const f = fixture(t);
  const handlers = new Map();
  const window = { isDestroyed: () => false, webContents: { mainFrame: {} } };
  const snapshots = [];
  const manager = new IPCManager({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) },
    database: f.database, appService: {}, settingsService: new SettingsService(new SettingsRepository(f.database)),
    recordServices: { plans: new PlanningService({ database: f.database, repository: f.plans }) },
    getWindow: () => window, onDataChanged: () => snapshots.push(f.service.list().items.map(item => item.date)),
  });
  manager.init();
  t.after(() => manager.shutdown());
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  async function invoke(channel, payload) {
    const result = await handlers.get(channel)(event, { ...payload, generation: f.database.connectionState.generation });
    assert.equal(result.ok, true);
    return result.value;
  }
  await invoke('settings:set-planning-enabled', { planningEnabled: true });
  const [item] = await invoke('plans:create', { rows: [{ title: 'План', controlDate: '2026-11-01',
    deadline: '2026-11-13', instructionNumber: '12', executor: 'Отдел' }] });
  await invoke('plans:update', { id: item.id, data: { extendedUntil: '2026-11-14' } });
  await invoke('settings:set-planning-enabled', { planningEnabled: false });
  await invoke('settings:set-planning-enabled', { planningEnabled: true });
  await invoke('plans:close-control', { id: item.id });
  await invoke('plans:remove', { id: item.id });
  assert.deepEqual(snapshots, [[], ['2026-11-13'], ['2026-11-14'], [], ['2026-11-14'], [], []]);
});

test('recurring tasks count each date in the calendar and acknowledge or complete it independently', t => {
  const { instructions, tasks, service } = fixture(t);
  const weekly = tasks.create({
    title: 'Еженедельная проверка', date: '2026-10-01', recurrence: { frequency: 'weekly' },
  });
  const custom = tasks.create({
    title: 'Проверка по датам', date: '2022-01-01',
    recurrence: { frequency: 'custom', customDates: ['2026-11-15', '2026-11-16'] },
  });
  const calendar = new CalendarService(instructions, tasks);
  const list = () => service.list().items;
  assert.deepEqual(list().map(({ recordId, date }) => [recordId, date]), [
    [custom.id, '2022-01-01'],
    [weekly.id, '2026-11-05'],
    [weekly.id, '2026-11-12'],
    [custom.id, '2026-11-15'],
  ]);
  assert.equal(new Set(list().map(item => item.id)).size, 4);

  const due = list().find(item => item.date === '2026-11-12');
  service.acknowledge({ items: [reference(due)], read: true, popup: true });
  assert.equal(list().find(item => item.id === due.id).unread, false);
  assert.equal(list().find(item => item.date === '2026-11-05').unread, true);

  tasks.updateOccurrence(weekly.id, '2026-11-05', true);
  assert.deepEqual(list().filter(item => item.recordId === weekly.id).map(item => item.date), ['2026-11-12']);
  const month = calendar.month({ month: '2026-11' });
  assert.deepEqual(month.days.filter(day => day.tasks || day.completedTasks).map(day => [day.date, day.tasks, day.completedTasks]), [
    ['2026-11-05', 0, 1], ['2026-11-12', 1, 0], ['2026-11-15', 1, 0],
    ['2026-11-16', 1, 0], ['2026-11-19', 1, 0], ['2026-11-26', 1, 0],
  ]);
  assert.deepEqual(calendar.day({ date: '2026-11-05' }).tasks.map(task => [task.date, task.seriesDate, task.completed]),
    [['2026-11-05', '2026-10-01', true]]);
});

test('moving a task occurrence changes the calendar and reminder date while preserving its reminder ID', t => {
  const { instructions, tasks, service, setToday } = fixture(t);
  setToday('2026-11-30');
  const task = tasks.create({
    title: 'Еженедельная задача', date: '2026-11-30', recurrence: { frequency: 'weekly' },
  });
  const calendar = new CalendarService(instructions, tasks);
  const original = service.list().items[0];
  service.acknowledge({ items: [reference(original)], read: true, popup: true });

  tasks.moveOccurrence(task.id, '2026-11-30', '2026-12-02');

  assert.deepEqual(calendar.day({ date: original.date }).tasks, []);
  assert.equal(calendar.day({ date: '2026-12-02' }).tasks[0].originalDate, original.date);
  assert.equal(calendar.month({ month: '2026-11' }).days[29].tasks, 0);
  assert.equal(calendar.month({ month: '2026-12' }).days[1].tasks, 1);
  const moved = service.list().items[0];
  assert.equal(moved.id, original.id);
  assert.equal(moved.date, '2026-12-02');
  assert.equal(moved.unread, true);
  assert.equal(moved.popupPending, true);

  service.acknowledge({ items: [reference(original)], read: true, popup: true });
  assert.equal(service.list().items[0].unread, true);
  tasks.updateOccurrence(task.id, moved.date, true);
  assert.deepEqual(service.list().items, []);
  assert.equal(calendar.day({ date: moved.date }).tasks[0].completed, true);
});

test('overdue task reminders honor earlier moves and skip displaced dates even beyond a year', t => {
  const { tasks, service } = fixture(t);
  const yearly = tasks.create({
    title: 'Ежегодная задача', date: '2023-11-10', recurrence: { frequency: 'yearly' },
  });
  const future = tasks.create({
    title: 'Задача по датам', date: '2029-01-01',
    recurrence: { frequency: 'custom', customDates: ['2030-01-01'] },
  });
  tasks.moveOccurrence(yearly.id, '2025-11-10', '2027-11-11');
  tasks.moveOccurrence(yearly.id, '2026-11-10', '2027-11-12');
  tasks.moveOccurrence(future.id, '2029-01-01', '2020-01-01');
  tasks.moveOccurrence(future.id, '2030-01-01', '2026-11-14');

  assert.deepEqual(service.list().items.map(({ recordId, date }) => [recordId, date]), [
    [future.id, '2020-01-01'], [yearly.id, '2024-11-10'], [future.id, '2026-11-14'],
  ]);
});

test('checking overdue reminders uses the same number of SQLite reads as more series are added', t => {
  const { database, tasks, service } = fixture(t);
  const createSeries = () => tasks.create({ title: 'Проверка', date: '2026-11-05', recurrence: { frequency: 'weekly' } });
  const first = createSeries();
  const statement = Object.getPrototypeOf(database.connection.prepare('SELECT 1'));
  const all = t.mock.method(statement, 'all');
  const get = t.mock.method(statement, 'get');
  function scan() {
    all.mock.resetCalls();
    get.mock.resetCalls();
    const items = service.list().items;
    return { items, reads: all.mock.callCount() + get.mock.callCount() };
  }
  const initial = scan();
  assert.equal(initial.items.length, 2);

  const moved = createSeries();
  tasks.moveOccurrence(moved.id, '2026-11-05', '2026-11-06');
  const completed = createSeries();
  tasks.moveOccurrence(completed.id, '2026-11-05', '2026-11-06');
  tasks.updateOccurrence(completed.id, '2026-11-06', true);
  const result = scan();
  assert.deepEqual(result.items.map(({ recordId, date }) => [recordId, date]), [
    [first.id, '2026-11-05'], [moved.id, '2026-11-06'],
    [first.id, '2026-11-12'], [moved.id, '2026-11-12'], [completed.id, '2026-11-12'],
  ]);
  assert.match(result.items[1].id, /:2026-11-05$/);
  assert.equal(result.reads, initial.reads);
});

test('checkpoint reminders follow moves, omit marked history and completed parents, and include every due occurrence', t => {
  const f = fixture(t);
  const instruction = f.instruction({ deadline: '2026-11-30', controlSchedule: {
    frequency: 'daily', firstDate: '2026-11-09',
    moves: [{ from: '2026-11-10', to: '2026-11-01' }],
    marks: [{ date: '2026-11-09', text: 'Доклад', actualDate: '2026-11-08' }],
  } });
  f.instruction({ deadline: '2026-11-30', status: 'completed', controlSchedule: { frequency: 'daily', firstDate: '2026-11-01' } });
  const items = f.service.list().items;
  assert.deepEqual(items.map(item => [item.kind, item.recordId, item.date]), [
    ['checkpoint', instruction.id, '2026-11-01'], ['checkpoint', instruction.id, '2026-11-11'],
    ['checkpoint', instruction.id, '2026-11-12'], ['checkpoint', instruction.id, '2026-11-13'],
    ['checkpoint', instruction.id, '2026-11-14'], ['checkpoint', instruction.id, '2026-11-15'],
  ]);
  const moved = items[0];
  f.service.acknowledge({ items: [reference(moved)], read: true, popup: true });
  f.instructions.update(instruction.id, { controlSchedule: {
    ...instruction.controlSchedule, moves: [{ from: '2026-11-10', to: '2026-11-02' }],
  } });
  const changed = f.service.list().items[0];
  assert.equal(changed.id, moved.id);
  assert.equal(changed.date, '2026-11-02');
  assert.equal(changed.unread, true);
  assert.equal(changed.popupPending, true);
});

test('read and popup receipts persist separately after reopening and renew on the next local day', t => {
  const f = fixture(t);
  f.tasks.create({ title: 'Дело', date: '2026-11-12' });
  const original = f.service.list().items[0];
  const popup = f.service.acknowledge({ items: [reference(original)], popup: true }).items[0];
  assert.equal(popup.unread, true);
  assert.equal(popup.popupPending, false);
  f.database.close(); f.database.open();
  assert.equal(f.service.list().items[0].popupPending, false);
  const read = f.service.acknowledge({ items: [reference(original)], read: true }).items[0];
  assert.equal(read.unread, false);
  assert.equal(read.popupPending, false);
  f.setToday('2026-11-13');
  const tomorrow = f.service.list().items[0];
  assert.equal(tomorrow.id, original.id);
  assert.equal(tomorrow.occurrence, '2026-11-12:2026-11-13');
  assert.equal(tomorrow.unread, true);
  assert.equal(tomorrow.popupPending, true);
  f.service.acknowledge({ items: [reference(original)], read: true, popup: true });
  assert.equal(f.service.list().items[0].unread, true);
});

test('receipts are isolated by database, record incarnation and current occurrence', t => {
  const f = fixture(t);
  const first = f.tasks.create({ title: 'Первое дело', date: '2026-11-12' });
  f.database.connection.prepare('UPDATE calendar_tasks SET created_at = ? WHERE id = ?').run('2026-10-01T00:00:00.000Z', first.id);
  const original = f.service.list().items[0];
  f.service.acknowledge({ items: [reference(original)], read: true, popup: true });
  f.database.replace({ filePath: path.join(f.directory, 'second.sqlite'), create: true });
  f.tasks.create({ title: 'Вторая база', date: '2026-11-12' });
  assert.equal(f.service.list().items[0].unread, true);
  f.database.replace({ filePath: f.filePath });
  assert.equal(f.service.list().items[0].unread, false);
  f.tasks.remove(first.id);
  const recreated = f.tasks.create({ title: 'Новое дело', date: '2026-11-12' });
  assert.equal(recreated.id, first.id);
  assert.notEqual(f.service.list().items[0].id, original.id);
  f.service.acknowledge({ items: [reference(original)], read: true, popup: true });
  assert.equal(f.service.list().items[0].unread, true);
});

test('acknowledgements validate before writes and preserve unrelated settings', t => {
  const f = fixture(t);
  f.tasks.create({ title: 'Дело', date: '2026-11-12' });
  f.database.connection.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('theme', 'dark');
  const item = reference(f.service.list().items[0]);
  for (const request of [null, [], {}, { items: null }, { items: [null] },
    { items: [{ ...item, id: '' }] }, { items: [{ ...item, occurrence: 'bad' }] },
    { items: [item], read: 'true' }, { items: [item], popup: 1 }]) {
    assert.throws(() => f.service.acknowledge(request), error => error.code === 'VALIDATION');
  }
  assert.equal(f.service.list().items[0].unread, true);
  f.service.acknowledge({ items: [item], read: true });
  assert.equal(new SettingsRepository(f.database).get().theme, 'dark');
  f.tasks.update(1, { completed: true });
  assert.deepEqual(f.service.acknowledge({ items: [item], popup: true }).items, []);
  f.tasks.update(1, { completed: false });
  assert.equal(f.service.list().items[0].unread, true);
});

test('notification IPC rejects stale databases and untrusted frames before acknowledgement', async t => {
  const f = fixture(t);
  f.tasks.create({ title: 'Дело', date: '2026-11-12' });
  const handlers = new Map();
  const window = { isDestroyed: () => false, webContents: { mainFrame: {} } };
  const manager = new IPCManager({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) },
    database: f.database, appService: { getInfo: () => ({}) },
    settingsService: new SettingsService(new SettingsRepository(f.database)),
    recordServices: {}, notifications: f.service, getWindow: () => window, logger: { error() {} },
  });
  manager.init(); t.after(() => manager.shutdown());
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const generation = f.database.getStatus().generation;
  const list = handlers.get('notifications:list');
  const acknowledge = handlers.get('notifications:acknowledge');
  assert.equal(typeof list, 'function');
  assert.equal(typeof acknowledge, 'function');
  const snapshot = await list(event, { generation });
  const request = { generation, items: snapshot.value.items.map(reference), read: true };
  assert.equal((await acknowledge({ ...event, senderFrame: {} }, request)).error.code, 'PERMISSION_DENIED');
  assert.equal((await acknowledge(event, { ...request, generation: generation - 1 })).error.code, 'DATABASE_CHANGED');
  assert.equal((await list(event, { generation: generation - 1 })).error.code, 'DATABASE_CHANGED');
  assert.equal(f.service.list().items[0].unread, true);
  assert.equal((await acknowledge(event, request)).value.items[0].unread, false);
  const direct = new BusinessHandler({ database: f.database, notifications: f.service }).requests();
  assert.throws(() => direct['notifications:acknowledge'](null), error => error.code === 'VALIDATION');
});
