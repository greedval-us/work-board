import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { NotificationStateRepository } from '../../src/main/repositories/NotificationStateRepository.js';
import { NotificationService } from '../../src/main/services/NotificationService.js';
import { BusinessHandler } from '../../src/main/ipc/BusinessHandler.js';
import { IPCManager } from '../../src/main/ipc/IPCManager.js';
import { SettingsRepository } from '../../src/main/repositories/SettingsRepository.js';
import { SettingsService } from '../../src/main/services/SettingsService.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-notifications-'));
  const filePath = path.join(directory, 'first.sqlite');
  const database = new DatabaseService({ filePath });
  database.open();
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  const instructions = new InstructionRepository(database);
  const tasks = new TaskRepository(database);
  let today = '2026-11-12';
  const service = new NotificationService({
    instructions, tasks, repository: new NotificationStateRepository(database), today: () => today,
  });
  const instruction = changes => instructions.create({
    controlDate: '2026-10-01', instructionNumber: '12/А', title: 'Указание',
    executor: 'Иванов', deadline: '2026-11-12', ...changes,
  });
  return { database, directory, filePath, instructions, tasks, service, instruction, setToday: value => { today = value; } };
}

const reference = item => ({ id: item.id, occurrence: item.occurrence });

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
