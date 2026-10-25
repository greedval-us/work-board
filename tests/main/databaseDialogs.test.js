import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseLocation } from '../../src/main/database/DatabaseLocation.js';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { DatabaseSelectionService } from '../../src/main/services/DatabaseSelectionService.js';

function fixture(t, dialog) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-dialog-'));
  const database = new DatabaseService();
  const connections = [database];
  t.after(() => {
    for (const item of connections) item.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const location = new DatabaseLocation({ userData: directory, database });
  const filePath = path.join(directory, 'original.sqlite');
  database.replace({ filePath, create: true, persist: selected => location.save(selected) });
  database.connection.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('theme', 'dark');
  const service = new DatabaseSelectionService({ database, location, dialog, getWindow: () => undefined });
  return { directory, database, location, service, connections };
}

function snapshot({ database, location }) {
  return {
    connection: database.connection,
    status: database.getStatus(),
    config: readFileSync(location.configPath),
  };
}

function assertUnchanged({ database, location }, before) {
  assert.strictEqual(database.connection, before.connection);
  assert.deepEqual(database.getStatus(), before.status);
  assert.deepEqual(readFileSync(location.configPath), before.config);
  assert.equal(database.connection.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'dark');
}

for (const mode of ['create', 'open']) {
  test(`cancelling the ${mode} dialog preserves the active connection, generation and saved path`, async (t) => {
    let selectedPath;
    const dialog = {
      showSaveDialog: async () => ({ canceled: true, filePath: selectedPath }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [selectedPath] }),
    };
    const state = fixture(t, dialog);
    selectedPath = path.join(state.directory, 'cancelled.sqlite');
    const before = snapshot(state);
    const result = await state.service[mode]();
    assert.deepEqual(result, { cancelled: true, status: before.status });
    assertUnchanged(state, before);
    assert.equal(existsSync(selectedPath), false);
  });
}

test('an overlapping dialog is rejected while the first selection remains pending', async (t) => {
  let resolveSave;
  const dialog = {
    showSaveDialog: () => new Promise(resolve => { resolveSave = resolve; }),
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  };
  const state = fixture(t, dialog);
  const before = snapshot(state);
  const pending = state.service.create();
  await assert.rejects(state.service.open(), /уже открыт/i);
  assertUnchanged(state, before);
  resolveSave({ canceled: true });
  assert.equal((await pending).cancelled, true);
  assert.equal((await state.service.open()).cancelled, true);
  assertUnchanged(state, before);
});

test('creating at an existing selected filename refuses to overwrite its SQLite data', async (t) => {
  let selectedPath;
  const state = fixture(t, { showSaveDialog: async () => ({ canceled: false, filePath: selectedPath }) });
  selectedPath = path.join(state.directory, 'existing.sqlite');
  const candidate = new DatabaseSync(selectedPath);
  candidate.exec("CREATE TABLE untouched (value TEXT NOT NULL); INSERT INTO untouched VALUES ('keep this data')");
  candidate.close();
  const candidateBytes = readFileSync(selectedPath);
  const before = snapshot(state);
  await assert.rejects(state.service.create(), error => error.code === 'DATABASE_EXISTS');
  assertUnchanged(state, before);
  assert.deepEqual(readFileSync(selectedPath), candidateBytes);
  const check = new DatabaseSync(selectedPath, { readOnly: true });
  try { assert.equal(check.prepare('SELECT value FROM untouched').get().value, 'keep this data'); }
  finally { check.close(); }
});

for (const kind of ['missing', 'foreign']) {
  test(`opening a ${kind} candidate leaves the old database usable and its location saved`, async (t) => {
    let selectedPath;
    const state = fixture(t, { showOpenDialog: async () => ({ canceled: false, filePaths: [selectedPath] }) });
    selectedPath = path.join(state.directory, `${kind}.sqlite`);
    if (kind === 'foreign') {
      const candidate = new DatabaseSync(selectedPath);
      candidate.exec('CREATE TABLE another_application (value INTEGER); PRAGMA user_version = 1');
      candidate.close();
    }
    const before = snapshot(state);
    const candidateBytes = kind === 'foreign' ? readFileSync(selectedPath) : null;
    const code = kind === 'foreign' ? 'DATABASE_FOREIGN' : 'DATABASE_MISSING';
    await assert.rejects(state.service.open(), error => error.code === code);
    assertUnchanged(state, before);
    if (candidateBytes) assert.deepEqual(readFileSync(selectedPath), candidateBytes);
    else assert.equal(existsSync(selectedPath), false);
    state.database.connection.prepare("UPDATE app_settings SET value = 'light' WHERE key = 'theme'").run();
    assert.equal(state.database.connection.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'light');
  });
}

for (const mode of ['create', 'open']) {
  test(`a successful ${mode} selection persists the exact path and restores its data in a fresh service`, async (t) => {
    let selectedPath;
    const dialog = {
      showSaveDialog: async () => ({ canceled: false, filePath: selectedPath }),
      showOpenDialog: async () => ({ canceled: false, filePaths: [selectedPath] }),
    };
    const state = fixture(t, dialog);
    selectedPath = path.join(state.directory, mode === 'create' ? 'chosen without extension' : 'chosen.sqlite');
    const expectedPath = mode === 'create' ? `${selectedPath}.sqlite` : selectedPath;
    if (mode === 'open') {
      const candidate = new DatabaseService();
      state.connections.push(candidate);
      candidate.replace({ filePath: selectedPath, create: true });
      candidate.connection.prepare("INSERT INTO app_settings VALUES ('candidate', 'selected data')").run();
      candidate.close();
    }
    const before = snapshot(state);
    const result = await state.service[mode]();
    assert.equal(result.cancelled, false);
    assert.equal(result.status.filePath, expectedPath);
    assert.equal(result.status.generation, before.status.generation + 1);
    assert.equal(result.status.ready, true);
    assert.equal(existsSync(expectedPath), true);
    assert.equal(JSON.parse(readFileSync(state.location.configPath, 'utf8')).filePath, expectedPath);
    assert.equal(state.database.connection.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get(), undefined);
    if (mode === 'open') assert.equal(state.database.connection.prepare("SELECT value FROM app_settings WHERE key = 'candidate'").get().value, 'selected data');
    state.database.connection.prepare("INSERT INTO app_settings VALUES ('theme', 'light')").run();
    state.database.close();
    const restored = new DatabaseService();
    state.connections.push(restored);
    const restoredLocation = new DatabaseLocation({ userData: state.directory, database: restored });
    const restoredStatus = restoredLocation.restore();
    assert.equal(restoredStatus.ready, true);
    assert.equal(restoredStatus.filePath, expectedPath);
    assert.equal(restored.connection.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'light');
    assert.notStrictEqual(restored.connection, before.connection);
  });
}
