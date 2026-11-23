import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from '../../src/main/database/sqlite.js';
import { migrations } from '../../src/main/database/migrations.js';

export async function verifyDatabaseRecovery(driver, { userData, dialogs, today }) {
  const historical = path.join(userData, 'unsigned-registry.sqlite');
  const foreign = path.join(userData, 'foreign-registry.sqlite');
  const title = 'Задача до обновления';
  const legacy = new DatabaseSync(historical);
  try {
    legacy.exec('PRAGMA journal_mode = WAL');
    for (const migration of migrations.filter(entry => entry.version <= 2)) legacy.exec(migration.sql);
    legacy.exec('PRAGMA user_version = 2');
    legacy.prepare('INSERT INTO calendar_tasks (id, title, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(71, title, today, today, today);
  } finally { legacy.close(); }
  copyFileSync(historical, foreign);
  const otherApplication = new DatabaseSync(foreign);
  try { otherApplication.exec('CREATE TABLE inventory (name TEXT)'); }
  finally { otherApplication.close(); }
  const originalBytes = readFileSync(foreign);

  await driver.navigate('/settings', 'Настройки');
  dialogs.openDatabase(historical);
  await driver.click('Открыть базу', '.storage-button');
  await driver.wait(`document.querySelector('.file-path')?.textContent === ${JSON.stringify(historical)}`);
  const recovered = await driver.api('database', 'getStatus');
  assert.equal(recovered.schemaVersion, migrations.at(-1).version);
  assert.equal((await driver.api('tasks', 'get', { id: 71, generation: recovered.generation })).title, title);

  dialogs.openDatabase(foreign);
  await assert.rejects(driver.api('database', 'open'), { code: 'DATABASE_FOREIGN' });
  assert.deepEqual(await driver.api('database', 'getStatus'), recovered);
  assert.deepEqual(readFileSync(foreign), originalBytes);
  for (const suffix of ['-wal', '-shm', '-journal']) assert.equal(existsSync(foreign + suffix), false);
  console.log('Unsigned database recovered through Settings. Foreign database and journal files preserved.');
}
