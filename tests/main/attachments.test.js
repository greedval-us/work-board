import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { AttachmentService } from '../../src/main/services/AttachmentService.js';
import { AttachmentRepository } from '../../src/main/repositories/AttachmentRepository.js';
import { AttachmentSelections } from '../../src/main/attachments/AttachmentSelections.js';
import { AttachmentStorage } from '../../src/main/attachments/AttachmentStorage.js';

function fixture(t, dependencies = () => ({})) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-files-'));
  const database = new DatabaseService({ filePath: path.join(directory, 'board.sqlite') });
  database.open();
  const tasks = new TaskRepository(database);
  const instructions = new InstructionRepository(database);
  let chosen = []; let destination; let cancelSave = false;
  const service = new AttachmentService({ database, tasks, instructions, repository: new AttachmentRepository(database), selections: new AttachmentSelections(),
    storage: new AttachmentStorage({ database, logger: { error() {} } }), getWindow: () => null, dialog: {
    showOpenDialog: async () => ({ canceled: chosen.length === 0, filePaths: chosen }),
    showSaveDialog: async () => ({ canceled: cancelSave, filePath: destination }),
  }, ...dependencies({ database, tasks, instructions }) });
  const generation = database.getStatus().generation;
  const request = { entityType: 'tasks', generation };
  t.after(() => { database.close(); const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(tmpdir()) + path.sep)); rmSync(target, { recursive: true, force: true }); });
  return { directory, database, tasks, instructions, service, request, choose: paths => { chosen = paths; }, saveTo: (file, cancelled = false) => { destination = file; cancelSave = cancelled; } };
}
const taskData = { title: 'Доклад', date: '2026-10-26' };

test('attachments copy only on save, preserve original names and can be downloaded after reopening', async t => {
  const f = fixture(t);
  const source = path.join(f.directory, 'Отчёт.txt'); writeFileSync(source, 'документ'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  assert.equal(picked.files[0].name, 'Отчёт.txt');
  assert.equal(existsSync(`${f.database.filePath}.files`), false);
  const task = await f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files, remove: [] } } });
  const files = f.service.list({ ...f.request, entityId: task.id });
  assert.equal(files.length, 1);
  const stored = f.database.connection.prepare('SELECT * FROM attachments').get();
  assert.equal(path.isAbsolute(stored.relative_path), false);
  assert.match(stored.relative_path, /^tasks\/1\//);
  assert.equal(readFileSync(path.join(`${f.database.filePath}.files`, stored.relative_path), 'utf8'), 'документ');
  writeFileSync(source, 'изменён');
  f.database.close(); f.database.open();
  const request = { ...f.request, generation: f.database.getStatus().generation, entityId: task.id, id: files[0].id };
  f.saveTo(path.join(f.directory, 'download.txt'));
  assert.equal((await f.service.download(request)).cancelled, false);
  assert.equal(readFileSync(path.join(f.directory, 'download.txt'), 'utf8'), 'документ');
  f.saveTo(null, true); assert.equal((await f.service.download(request)).cancelled, true);
});

test('same names stay separate and cancelling changes leaves existing files intact', async t => {
  const f = fixture(t); const sources = ['a', 'b'].map(folder => { mkdirSync(path.join(f.directory, folder)); const file = path.join(f.directory, folder, 'same.txt'); writeFileSync(file, folder); return file; });
  f.choose(sources); const picked = await f.service.pick(f.request);
  const task = await f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } });
  const files = f.service.list({ ...f.request, entityId: task.id });
  assert.equal(files.length, 2); assert.equal(new Set(files.map(file => file.relativePath)).size, 2);
  await assert.rejects(f.service.save({ ...f.request, id: task.id, data: { title: '', attachments: { remove: files.map(file => file.id) } } }));
  assert.equal(f.service.list({ ...f.request, entityId: task.id }).length, 2);
  await f.service.remove({ ...f.request, id: task.id });
  assert.equal(f.database.connection.prepare('SELECT COUNT(*) AS n FROM attachments').get().n, 0);
  for (const file of files) assert.equal(existsSync(path.join(`${f.database.filePath}.files`, file.relativePath)), false);
});

test('concurrent partial saves without new files preserve both field changes', async t => {
  const f = fixture(t);
  const task = f.tasks.create(taskData);
  await Promise.all([
    f.service.save({ ...f.request, id: task.id, data: { title: 'Новое название' } }),
    f.service.save({ ...f.request, id: task.id, data: { description: 'Новое описание' } }),
  ]);
  assert.equal(f.tasks.get(task.id).title, 'Новое название');
  assert.equal(f.tasks.get(task.id).description, 'Новое описание');
});

test('a partial save after file staging preserves fields changed while copying', async t => {
  const f = fixture(t);
  const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  const task = f.tasks.create(taskData);
  const pending = f.service.save({ ...f.request, id: task.id, data: { title: 'Новое название', attachments: { add: picked.files } } });
  await f.service.save({ ...f.request, id: task.id, data: { description: 'Новое описание' } });
  await pending;
  assert.equal(f.tasks.get(task.id).title, 'Новое название');
  assert.equal(f.tasks.get(task.id).description, 'Новое описание');
  assert.equal(f.service.list({ ...f.request, entityId: task.id }).length, 1);
});

test('invalid tokens, foreign owners, filesystem failures and stale generations cannot write', async t => {
  const f = fixture(t);
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: [{ token: '../bad' }] } } }), /выберите|файл/i);
  assert.equal(f.tasks.list().length, 0);
  const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'x'); f.choose([source]);
  const picked = await f.service.pick(f.request); rmSync(source);
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } }));
  assert.equal(f.tasks.list().length, 0);
  f.database.replace({ filePath: path.join(f.directory, 'other.sqlite'), create: true });
  await assert.rejects(f.service.pick(f.request), { code: 'DATABASE_CHANGED' });
  assert.throws(() => f.service.list({ ...f.request, generation: f.database.getStatus().generation, entityType: '../', entityId: 1 }), /тип/i);
});

test('failed metadata write rolls back the record and cleans every copied file', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  f.database.connection.exec("CREATE TRIGGER fail_attachment BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'write failure'); END;");
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } }), /write failure/);
  assert.equal(f.tasks.list().length, 0);
  assert.equal(readdirSync(f.database.filePath + '.files', { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length, 0);
  f.database.connection.exec('DROP TRIGGER fail_attachment');
  const task = await f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } });
  assert.equal(f.service.list({ ...f.request, entityId: task.id }).length, 1, 'selection survives failed save for retry');
});

test('injected metadata repository failure rolls back the saved record and installed files', async t => {
  const f = fixture(t, ({ database }) => {
    const repository = new AttachmentRepository(database);
    repository.insert = () => { throw new Error('injected metadata failure'); };
    return { repository };
  });
  const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } }), /injected metadata failure/);
  assert.equal(f.tasks.list().length, 0);
  assert.equal(readdirSync(f.database.filePath + '.files', { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length, 0);
});

test('instructions and tasks keep independent ownership and committed file removal', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const request = { ...f.request, entityType: 'instructions' }; const picked = await f.service.pick(request);
  const instruction = await f.service.save({ ...request, data: { controlDate: '2026-10-26', instructionNumber: '1', title: 'Указание', deadline: '2026-10-27', executor: 'Иванов', attachments: { add: picked.files } } });
  const file = f.service.list({ ...request, entityId: instruction.id })[0];
  const task = f.tasks.create(taskData);
  await assert.rejects(f.service.save({ ...f.request, id: task.id, data: { title: 'bad change', attachments: { remove: [file.id] } } }), /не принадлежит/);
  assert.equal(f.tasks.get(task.id).title, taskData.title);
  await assert.rejects(f.service.download({ ...f.request, entityId: task.id, id: file.id }), { code: 'NOT_FOUND' });
  await f.service.save({ ...request, id: instruction.id, data: { attachments: { remove: [file.id] } } });
  assert.equal(f.service.list({ ...request, entityId: instruction.id }).length, 0);
  assert.equal(existsSync(path.join(f.database.filePath + '.files', file.relativePath)), false);
});

test('download refuses tampered paths, missing files and overwriting the working database', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request); const task = await f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } });
  const file = f.service.list({ ...f.request, entityId: task.id })[0]; const request = { ...f.request, entityId: task.id, id: file.id };
  f.saveTo(f.database.filePath); await assert.rejects(f.service.download(request), /выберите место/i);
  f.database.connection.prepare('UPDATE attachments SET relative_path = ? WHERE id = ?').run('../source.txt', file.id);
  await assert.rejects(f.service.download(request), /путь/i);
  f.database.connection.prepare('UPDATE attachments SET relative_path = ? WHERE id = ?').run(file.relativePath, file.id);
  rmSync(path.join(f.database.filePath + '.files', file.relativePath));
  await assert.rejects(f.service.download(request), /не найден/i);
  assert.equal(readFileSync(source, 'utf8'), 'body');
});

test('directory junctions cannot redirect attachment writes outside storage', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const outside = path.join(f.directory, 'outside'); mkdirSync(outside);
  const root = f.database.filePath + '.files'; mkdirSync(root);
  symlinkSync(outside, path.join(root, 'tasks'), 'junction');
  const picked = await f.service.pick(f.request);
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } }), /ссылк/i);
  assert.equal(f.tasks.list().length, 0); assert.deepEqual(readdirSync(outside), []);
});

test('a database switch while picking files rejects the late selection', async t => {
  const f = fixture(t); let finish;
  f.service.dialog.showOpenDialog = () => new Promise(resolve => { finish = resolve; });
  const pending = f.service.pick(f.request);
  f.database.replace({ filePath: path.join(f.directory, 'new.sqlite'), create: true });
  finish({ canceled: false, filePaths: [] });
  await assert.rejects(pending, { code: 'DATABASE_CHANGED' });
});

test('a database switch after source inspection cannot return late selection tokens', async t => {
  const f = fixture(t, ({ database }) => {
    const storage = new AttachmentStorage({ database });
    const inspect = storage.inspectSources.bind(storage);
    storage.inspectSources = async (...args) => {
      const files = await inspect(...args);
      database.replace({ filePath: path.join(path.dirname(database.filePath), 'switched.sqlite'), create: true });
      return files;
    };
    return { storage };
  });
  const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  await assert.rejects(f.service.pick(f.request), { code: 'DATABASE_CHANGED' });
});

test('selection tokens cannot be reused by another owner or after a committed save', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  await assert.rejects(f.service.save({ ...f.request, entityType: 'instructions', data: {
    controlDate: '2026-10-26', instructionNumber: '1', title: 'Указание', deadline: '2026-10-27', executor: 'Иванов', attachments: { add: picked.files },
  } }), /повторно выберите/i);
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: [...picked.files, ...picked.files] } } }), /повторно выберите/i);
  const task = await f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } });
  await assert.rejects(f.service.save({ ...f.request, id: task.id, data: { attachments: { add: picked.files } } }), /повторно выберите/i);
  assert.equal(f.service.list({ ...f.request, entityId: task.id }).length, 1);
});

test('discarded file selections are released without copying or modifying the record', async t => {
  const f = fixture(t); const source = path.join(f.directory, 'source.txt'); writeFileSync(source, 'body'); f.choose([source]);
  const picked = await f.service.pick(f.request);
  assert.deepEqual(f.service.release({ ...f.request, tokens: [picked.files[0].token] }), { released: true });
  await assert.rejects(f.service.save({ ...f.request, data: { ...taskData, attachments: { add: picked.files } } }), /повторно выберите/i);
  assert.equal(f.tasks.list().length, 0); assert.equal(existsSync(f.database.filePath + '.files'), false);
});
