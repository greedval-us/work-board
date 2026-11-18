import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { RecordService } from '../../src/main/services/RecordService.js';
import { ENTITY_TYPES } from '../../src/shared/constants/entities.js';
import { BusinessHandler } from '../../src/main/ipc/BusinessHandler.js';
import { IPC_CHANNELS } from '../../src/shared/constants/ipcChannels.js';

test('record service writes record data and ignores former attachment changes', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-record-service-'));
  const filePath = path.join(directory, 'records.sqlite');
  const database = new DatabaseService({ filePath });
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  database.open();
  const { connection } = database;
  const service = new RecordService({ database, repository: new TaskRepository(database) });
  const attachments = { add: [{ token: 'old-selection' }], remove: [1] };
  const created = service.create({
    data: { title: 'Task', date: '2026-10-26', attachments }, generation: 1, id: 999, entityType: 'untrusted',
  });
  const storage = `${filePath}.files`;
  assert.equal(existsSync(storage), false);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM attachments').get().n, 0);
  const relativePath = `tasks/${created.id}/0d18511f-9c79-4f94-bcf2-1939f7bd7ed8`;
  const oldFile = path.join(storage, relativePath);
  mkdirSync(path.dirname(oldFile), { recursive: true });
  writeFileSync(oldFile, 'preserve old file');
  connection.prepare('INSERT INTO attachments (task_id, name, relative_path, size, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(created.id, 'old-file.txt', relativePath, 17, '2026-10-26');
  assert.equal(service.get({ id: created.id }).title, 'Task');
  assert.equal(service.list({ from: '2026-10-26' }).length, 1);
  service.update({ id: created.id, data: { completed: true, attachments } });
  assert.equal(service.get({ id: created.id }).title, 'Task');
  assert.equal(service.get({ id: created.id }).completed, true);
  assert.deepEqual(connection.prepare('SELECT name FROM attachments').all().map(row => row.name), ['old-file.txt']);
  assert.equal(readFileSync(oldFile, 'utf8'), 'preserve old file');
  assert.throws(() => service.update({ id: null, data: {} }), /идентификатор/);
  service.remove({ id: created.id });
  assert.deepEqual(service.list(), []);
  assert.equal(readFileSync(oldFile, 'utf8'), 'preserve old file');
});

test('IPC guard rejects stale generations before a business command can mutate data', () => {
  let called = false;
  let occurrence;
  let move;
  const handler = new BusinessHandler({
    database: { assertGeneration: generation => { if (generation !== 2) throw new Error('stale generation'); } },
    recordServices: { [ENTITY_TYPES.TASKS]: {
      create: () => { called = true; },
      setOccurrenceCompleted: payload => { occurrence = payload; },
      moveOccurrence: payload => { move = payload; },
    } },
  });
  const requests = handler.requests();
  assert.equal(Object.keys(requests).some(channel => channel.startsWith('attachments:')), false);
  const create = requests[IPC_CHANNELS.tasks.create];
  assert.throws(() => create({ generation: 1, data: {} }), /stale generation/);
  assert.equal(called, false);
  create({ generation: 2, data: {} }); assert.equal(called, true);

  const complete = requests[IPC_CHANNELS.tasks.setOccurrenceCompleted];
  const payload = { id: 1, date: '2026-11-17', completed: true, generation: 2 };
  assert.throws(() => complete({ ...payload, generation: 1 }), /stale generation/);
  assert.equal(occurrence, undefined);
  complete(payload);
  assert.deepEqual(occurrence, payload);

  const relocate = requests[IPC_CHANNELS.tasks.moveOccurrence];
  const dates = { id: 1, from: '2026-11-17', to: '2026-11-20', generation: 2 };
  assert.throws(() => relocate({ ...dates, generation: 1 }), /stale generation/);
  assert.equal(move, undefined);
  relocate(dates);
  assert.deepEqual(move, dates);
});
