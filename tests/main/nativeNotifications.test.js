import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { NotificationStateRepository } from '../../src/main/repositories/NotificationStateRepository.js';
import { NotificationService } from '../../src/main/services/NotificationService.js';
import { NativeNotificationScheduler } from '../../src/main/notifications/NativeNotificationScheduler.js';
import { localDate } from '../../src/shared/dates.js';

class Clock {
  time = new Date(2026, 10, 12, 12).getTime();
  jobs = new Map();
  serial = 0;
  now = () => this.time;
  setTimeout = (callback, delay) => this.add(callback, delay, false);
  setInterval = (callback, delay) => this.add(callback, delay, true);
  clearTimeout = id => this.jobs.delete(id);
  clearInterval = id => this.jobs.delete(id);
  add(callback, delay, repeat) {
    const id = ++this.serial;
    this.jobs.set(id, { callback, at: this.time + delay, delay, repeat });
    return id;
  }
  advance(delay) {
    const until = this.time + delay;
    for (;;) {
      const next = [...this.jobs].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, job] = next;
      this.time = job.at;
      if (job.repeat) job.at += job.delay;
      else this.jobs.delete(id);
      job.callback();
    }
    this.time = until;
  }
}

function fixture(t, { supported = true, ready = true } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-native-notifications-'));
  const firstPath = path.join(directory, 'first.sqlite');
  const database = new DatabaseService({ filePath: firstPath });
  if (ready) database.open();
  const clock = new Clock();
  const tasks = new TaskRepository(database);
  const service = new NotificationService({
    instructions: new InstructionRepository(database), tasks,
    repository: new NotificationStateRepository(database), today: () => localDate(new Date(clock.time)),
  });
  const shown = [], opened = [], errors = [];
  const powerMonitor = new EventEmitter();
  const scheduler = new NativeNotificationScheduler({
    database, notifications: service, timers: clock, now: clock.now, powerMonitor,
    isSupported: () => supported,
    createNotification(options) {
      const native = new EventEmitter();
      Object.assign(native, { options, showCount: 0, closeCount: 0,
        show() { this.showCount++; }, close() { this.closeCount++; this.emit('close'); },
      });
      shown.push(native);
      return native;
    },
    onOpen: value => opened.push(value), logger: { error: (...args) => errors.push(args) },
  });
  t.after(() => { scheduler.stop(); database.close(); rmSync(directory, { recursive: true, force: true }); });
  const task = changes => tasks.create({ title: 'Подготовить доклад', date: '2026-11-12', ...changes });
  return { database, directory, firstPath, tasks, task, service, clock, shown, opened, errors, powerMonitor, scheduler };
}

test('native reminders aggregate pending deadlines and persist popup delivery only after show', t => {
  const f = fixture(t);
  f.task(); f.task({ title: 'Проверить отчёт', date: '2026-11-11' });
  f.task({ title: 'Готово', completed: true });
  f.scheduler.start(); f.scheduler.start(); f.scheduler.check();
  assert.equal(f.shown.length, 1);
  assert.equal(f.shown[0].showCount, 1);
  assert.match(f.shown[0].options.body, /Подготовить доклад/);
  assert.match(f.shown[0].options.body, /Проверить отчёт/);
  assert.ok(f.service.list().items.every(item => item.popupPending && item.unread));
  f.shown[0].emit('show'); f.shown[0].emit('show');
  assert.ok(f.service.list().items.every(item => !item.popupPending && item.unread));
  f.clock.advance(120_000);
  assert.equal(f.shown.length, 1);
  assert.deepEqual(f.scheduler.getStatus(), { mode: 'system', error: '' });
});

test('native clicks survive toast timeout in Action Center and keep reminders unread', t => {
  const f = fixture(t);
  f.task();
  const item = f.service.list().items[0];
  f.scheduler.start();
  f.shown[0].emit('show'); f.shown[0].emit('close'); f.shown[0].emit('click');
  f.shown[0].emit('click');
  assert.deepEqual(f.opened, [{ generation: 1, today: '2026-11-12', items: [{ id: item.id, occurrence: item.occurrence }] }]);
  assert.equal(f.service.list().items[0].unread, true);
  assert.equal(f.scheduler.getStatus().error, '');
});

test('native scheduler keeps checking without a window and resumes when a database becomes ready', t => {
  const f = fixture(t, { ready: false });
  assert.equal(f.scheduler.start(), true);
  assert.equal(f.shown.length, 0);
  f.database.open(); f.task();
  f.clock.advance(60_000);
  assert.equal(f.shown.length, 1);
  f.shown[0].emit('show');
  f.task({ title: 'После сна' }); f.powerMonitor.emit('resume');
  assert.equal(f.shown.length, 2);
  f.shown[1].emit('show');
  f.task({ title: 'После разблокировки' }); f.powerMonitor.emit('unlock-screen');
  assert.equal(f.shown.length, 3);
});

test('unsupported native delivery falls back without installing timers or power listeners', t => {
  const f = fixture(t, { supported: false });
  f.task();
  assert.equal(f.scheduler.start(), false);
  f.scheduler.check();
  assert.deepEqual(f.scheduler.getStatus(), { mode: 'in-app', error: '' });
  assert.equal(f.shown.length, 0);
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.powerMonitor.listenerCount('resume'), 0);
});

test('failed delivery retries at most three times with a cooldown and never consumes popup receipts', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.shown[0].emit('failed', {}, 'OS denied notification with private path');
  f.scheduler.check(); f.powerMonitor.emit('resume');
  assert.equal(f.shown.length, 1);
  assert.equal(f.scheduler.getStatus().mode, 'system');
  assert.match(f.scheduler.getStatus().error, /Windows/);
  assert.doesNotMatch(f.scheduler.getStatus().error, /private path/);
  f.clock.advance(60_000); f.shown[1].emit('failed', {}, 'denied');
  f.clock.advance(60_000); f.shown[2].emit('failed', {}, 'denied');
  f.clock.advance(5 * 60_000);
  assert.equal(f.shown.length, 3);
  assert.equal(f.service.list().items[0].popupPending, true);
  assert.ok(f.shown.every(native => native.closeCount === 1 && native.listenerCount('show') === 0));
});

test('late native failure after show remains visible and retries despite the saved popup receipt', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.shown[0].emit('show');
  assert.equal(f.service.list().items[0].popupPending, false);
  f.shown[0].emit('failed', {}, 'Windows rejected queued delivery');
  assert.notEqual(f.scheduler.getStatus().error, '');
  f.scheduler.check();
  assert.equal(f.shown.length, 1);
  for (let index = 1; index < 3; index++) {
    f.clock.advance(60_000);
    assert.equal(f.shown.length, index + 1);
    f.shown[index].emit('show');
    assert.equal(f.scheduler.getStatus().error, '');
    f.shown[index].emit('failed', {}, 'Windows rejected queued delivery');
  }
  f.clock.advance(5 * 60_000);
  assert.equal(f.shown.length, 3);
  assert.equal(f.service.list().items[0].unread, true);
  assert.notEqual(f.scheduler.getStatus().error, '');
});

test('a missing show event times out and a later successful retry clears the delivery warning', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.clock.advance(15_000);
  assert.equal(f.shown[0].closeCount, 1);
  assert.notEqual(f.scheduler.getStatus().error, '');
  f.shown[0].emit('show');
  assert.equal(f.service.list().items[0].popupPending, true);
  f.clock.advance(45_000);
  assert.equal(f.shown.length, 2);
  f.shown[1].emit('show');
  assert.equal(f.scheduler.getStatus().error, '');
  assert.equal(f.service.list().items[0].popupPending, false);
});

test('late show and click callbacks cannot acknowledge or open a different database', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.database.replace({ filePath: path.join(f.directory, 'second.sqlite'), create: true });
  f.task({ title: 'Другая база' });
  f.shown[0].emit('show'); f.shown[0].emit('click');
  assert.equal(f.service.list().items[0].popupPending, true);
  assert.deepEqual(f.opened, []);
  f.scheduler.check();
  assert.equal(f.shown.length, 2);
  f.shown[1].emit('show');
  assert.equal(f.service.list().items[0].popupPending, false);
});

test('previous-day callbacks do not consume today receipts and today creates a fresh reminder', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.clock.time = new Date(2026, 10, 13, 0, 1).getTime();
  f.shown[0].emit('show'); f.shown[0].emit('click');
  assert.equal(f.service.list().items[0].popupPending, true);
  assert.deepEqual(f.opened, []);
  f.scheduler.check();
  assert.equal(f.shown.length, 2);
  f.shown[1].emit('show');
  assert.equal(f.service.list().items[0].popupPending, false);
});

test('completed, removed and rescheduled occurrences cannot be acknowledged by a stale native toast', t => {
  const f = fixture(t);
  const completed = f.task(), removed = f.task(), changed = f.task();
  f.scheduler.start();
  f.tasks.update(completed.id, { completed: true });
  f.tasks.remove(removed.id);
  f.tasks.update(changed.id, { date: '2026-11-13' });
  f.shown[0].emit('show'); f.shown[0].emit('click');
  assert.equal(f.service.list().items[0].popupPending, true);
  assert.deepEqual(f.opened, []);
  f.scheduler.check();
  assert.equal(f.shown.length, 2);
});

test('session deduplication prevents repeated native popups when saving a delivery receipt fails', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.service.acknowledge = () => { throw new Error('write failed'); };
  f.shown[0].emit('show'); f.shown[0].emit('show');
  f.clock.advance(5 * 60_000);
  assert.equal(f.shown.length, 1);
  assert.equal(f.service.list().items[0].popupPending, true);
  assert.notEqual(f.errors.length, 0);
});

test('a failed popup receipt is saved on the next check without displaying another toast', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  const acknowledge = f.service.acknowledge.bind(f.service);
  f.service.acknowledge = () => { throw new Error('database temporarily busy'); };
  f.shown[0].emit('show');
  assert.match(f.scheduler.getStatus().error, /сохранить/i);
  assert.doesNotMatch(f.scheduler.getStatus().error, /разрешения/i);
  assert.equal(f.service.list().items[0].popupPending, true);
  f.service.acknowledge = acknowledge;
  f.clock.advance(60_000);
  assert.equal(f.shown.length, 1);
  assert.equal(f.service.list().items[0].popupPending, false);
  assert.equal(f.service.list().items[0].unread, true);
  assert.equal(f.scheduler.getStatus().error, '');
});

test('delivery errors from an old database are cleared when selecting an empty database', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start(); f.shown[0].emit('failed', {}, 'private OS error');
  assert.ok(f.scheduler.getStatus().error);
  f.database.replace({ filePath: path.join(f.directory, 'empty.sqlite'), create: true });
  f.scheduler.check();
  assert.equal(f.scheduler.getStatus().error, '');
});

test('a displayed toast is not shown again when revalidating its delivery temporarily fails', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  const list = f.service.list.bind(f.service);
  f.service.list = () => { throw new Error('database temporarily busy'); };
  f.shown[0].emit('show');
  f.service.list = list;
  f.clock.advance(60_000);
  assert.equal(f.shown.length, 1);
  assert.equal(f.service.list().items[0].popupPending, false);
  f.shown[0].emit('click');
  assert.equal(f.opened.length, 1);
});

test('native creation and show exceptions stay contained and do not consume receipts', t => {
  const f = fixture(t);
  f.task();
  const create = f.scheduler.createNotification;
  f.scheduler.createNotification = () => { throw new Error('native construction failed'); };
  assert.doesNotThrow(() => f.scheduler.start());
  assert.equal(f.service.list().items[0].popupPending, true);
  f.scheduler.createNotification = options => {
    const native = create(options);
    native.show = () => { throw new Error('native show failed'); };
    return native;
  };
  assert.doesNotThrow(() => f.clock.advance(60_000));
  assert.equal(f.shown[0].closeCount, 1);
  assert.equal(f.shown[0].eventNames().length, 0);
  assert.equal(f.service.list().items[0].popupPending, true);
  f.scheduler.createNotification = create;
  f.clock.advance(60_000); f.shown[1].emit('show');
  assert.equal(f.service.list().items[0].popupPending, false);
});

test('an aggregate only acknowledges and opens the occurrences that are still current', t => {
  const f = fixture(t);
  const completed = f.task(), current = f.task();
  f.scheduler.start();
  f.tasks.update(completed.id, { completed: true });
  f.shown[0].emit('show'); f.shown[0].emit('click');
  assert.equal(f.service.list().items[0].recordId, current.id);
  assert.equal(f.service.list().items[0].popupPending, false);
  assert.equal(f.opened[0].items.length, 1);
  f.tasks.update(completed.id, { completed: false });
  assert.equal(f.service.list().items.find(item => item.recordId === completed.id).popupPending, true);
});

test('Action Center retention stays bounded and releases the oldest callbacks', t => {
  const f = fixture(t);
  f.scheduler.start();
  for (let index = 0; index < 40; index++) {
    f.task({ title: `Новое дело ${index}` });
    f.scheduler.check();
    f.shown[index].emit('show'); f.shown[index].emit('close');
  }
  assert.equal(f.shown.length, 40);
  const retained = f.shown.filter(native => native.listenerCount('click'));
  assert.ok(retained.length > 0 && retained.length <= 32);
  assert.equal(f.shown[0].closeCount, 1);
  assert.equal(f.shown[0].eventNames().length, 0);
  f.shown[0].emit('click');
  assert.equal(f.opened.length, 0);
  f.shown.at(-1).emit('click');
  assert.equal(f.opened.length, 1);
});

test('synchronous show callbacks and write-triggered checks cannot produce duplicate popups', t => {
  const f = fixture(t);
  f.task();
  const acknowledge = f.service.acknowledge.bind(f.service);
  f.service.acknowledge = value => { const result = acknowledge(value); f.scheduler.check(); return result; };
  const createNotification = f.scheduler.createNotification;
  f.scheduler.createNotification = options => {
    const native = createNotification(options);
    native.show = () => { native.showCount++; native.emit('show'); };
    return native;
  };
  f.scheduler.start();
  assert.equal(f.shown.length, 1);
  assert.equal(f.service.list().items[0].popupPending, false);
});

test('stop clears pending timers, power listeners and retained native callbacks', t => {
  const f = fixture(t);
  f.task(); f.scheduler.start();
  f.shown[0].emit('show'); f.shown[0].emit('close');
  f.task(); f.scheduler.check();
  f.scheduler.stop(); f.scheduler.stop();
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.powerMonitor.listenerCount('resume'), 0);
  assert.equal(f.powerMonitor.listenerCount('unlock-screen'), 0);
  assert.ok(f.shown.every(native => native.closeCount === 1 && native.eventNames().length === 0));
  f.shown[0].emit('click'); f.shown[1].emit('show'); f.powerMonitor.emit('resume');
  assert.deepEqual(f.opened, []);
  assert.equal(f.service.list().items[1].popupPending, true);
  assert.deepEqual(f.scheduler.getStatus(), { mode: 'in-app', error: '' });
});
