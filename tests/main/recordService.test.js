import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { RecordService } from '../../src/main/services/RecordService.js';
import { ENTITY_TYPES } from '../../src/shared/constants/entities.js';
import { BusinessHandler } from '../../src/main/ipc/BusinessHandler.js';
import { IPC_CHANNELS } from '../../src/shared/constants/ipcChannels.js';

test('record service keeps queries in repository and coordinates commands through its attachment policy', async t => {
  const connection = new DatabaseSync(':memory:'); migrate(connection); t.after(() => connection.close());
  const repository = new TaskRepository({ connection });
  const attachments = {
    save: async request => request.id == null ? repository.create(request.data) : repository.update(request.id, request.data),
    remove: async request => repository.remove(request.id),
  };
  const service = new RecordService({ entityType: ENTITY_TYPES.TASKS, repository, attachments });
  const created = await service.create({ data: { title: 'Task', date: '2026-10-26' }, generation: 1, id: 999, entityType: 'untrusted' });
  assert.equal(service.get({ id: created.id }).title, 'Task');
  assert.equal(service.list({ from: '2026-10-26' }).length, 1);
  await service.update({ id: created.id, data: { completed: true } });
  assert.equal(service.get({ id: created.id }).completed, true);
  assert.throws(() => service.update({ id: null, data: {} }), /идентификатор/);
  await service.remove({ id: created.id });
  assert.deepEqual(service.list(), []);
});

test('IPC guard rejects stale generations before a business command can mutate data', () => {
  let called = false;
  const handler = new BusinessHandler({
    database: { assertGeneration: generation => { if (generation !== 2) throw new Error('stale generation'); } },
    recordServices: { [ENTITY_TYPES.TASKS]: { create: () => { called = true; } } },
  });
  const create = handler.requests()[IPC_CHANNELS.tasks.create];
  assert.throws(() => create({ generation: 1, data: {} }), /stale generation/);
  assert.equal(called, false);
  create({ generation: 2, data: {} }); assert.equal(called, true);
});
