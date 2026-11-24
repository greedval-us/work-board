import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AppLockService } from '../../src/main/services/AppLockService.js';

const PASSWORD = 'Пароль для Work Board';
const MINUTE_MS = 60_000;

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'work-board-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'profile', 'app-lock.json');
  const changes = [];
  let time = 100_000;
  const options = { filePath, now: () => time, onStatusChanged: status => changes.push(status) };
  const service = new AppLockService(options);
  return { filePath, service, options, changes, advance: ms => { time += ms; } };
}

test('persisted protection starts locked after reopening and stores only a password verifier', async t => {
  const { filePath, options, service } = await fixture(t);
  assert.deepEqual(service.getStatus(), { enabled: false, locked: false, timeoutMinutes: 5 });
  assert.deepEqual(await service.configure({ password: PASSWORD, timeoutMinutes: 60 }),
    { enabled: true, locked: false, timeoutMinutes: 60 });
  assert.equal((await readFile(filePath, 'utf8')).includes(PASSWORD), false);

  const restarted = new AppLockService(options);
  assert.deepEqual(restarted.getStatus(), { enabled: true, locked: true, timeoutMinutes: 60 });
  await assert.rejects(restarted.unlock({ password: 'неверный' }), /Неверный пароль/);
  assert.equal(restarted.getStatus().locked, true);
  assert.equal((await restarted.unlock({ password: PASSWORD })).locked, false);
});

for (const timeoutMinutes of [5, 60, 180]) {
  test(`locks after ${timeoutMinutes} minutes since the last activity`, async t => {
    const { service, advance, changes } = await fixture(t);
    await service.configure({ password: PASSWORD, timeoutMinutes });
    advance(timeoutMinutes * MINUTE_MS - 1);
    service.recordActivity();
    advance(timeoutMinutes * MINUTE_MS - 1);
    assert.equal(service.getStatus().locked, false);
    advance(1);
    service.recordActivity();
    assert.equal(service.getStatus().locked, true);
    assert.equal(changes.at(-1).locked, true);
    assert.equal(changes.length, 2);
  });
}

test('changing settings and disabling protection require the current password', async t => {
  const { options, service } = await fixture(t);
  await assert.rejects(service.configure({ password: ' ', timeoutMinutes: 5 }), /пароль/i);
  await assert.rejects(service.configure({ password: PASSWORD, timeoutMinutes: 15 }), /время/i);
  await service.configure({ password: PASSWORD, timeoutMinutes: 5 });
  await assert.rejects(service.configure({ password: '', currentPassword: 'неверный', timeoutMinutes: 5 }), /Неверный пароль/);
  await assert.rejects(service.configure({ timeoutMinutes: 180 }), /пароль/i);
  await service.configure({ currentPassword: PASSWORD, timeoutMinutes: 180 });
  assert.equal(service.getStatus().timeoutMinutes, 180);
  const newPassword = 'Новый пароль';
  await service.configure({ currentPassword: PASSWORD, password: newPassword, timeoutMinutes: 180 });
  assert.equal(service.lock().locked, true);
  await assert.rejects(service.unlock({ password: PASSWORD }), /Неверный пароль/);
  await service.unlock({ password: newPassword });
  await service.configure({ currentPassword: newPassword, password: '', timeoutMinutes: 180 });
  assert.equal(service.lock().locked, false);
  assert.equal(new AppLockService(options).getStatus().enabled, false);
});

test('failed authentication temporarily limits both configuration and unlock attempts', async t => {
  const { advance, service } = await fixture(t);
  await service.configure({ password: PASSWORD, timeoutMinutes: 5 });
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(service.configure({ currentPassword: 'неверный', timeoutMinutes: 60 }), /Неверный пароль/);
  }
  service.lock();
  await assert.rejects(service.unlock({ password: 'неверный' }), /30 сек/);
  await assert.rejects(service.unlock({ password: PASSWORD }), /30 сек/);
  advance(30_000);
  assert.equal((await service.unlock({ password: PASSWORD })).locked, false);
});

test('a settings change cannot commit after the application locks during password validation', async t => {
  const { options, service, advance } = await fixture(t);
  await service.configure({ password: PASSWORD, timeoutMinutes: 5 });
  const disabling = service.configure({ currentPassword: PASSWORD, password: '', timeoutMinutes: 5 });
  advance(5 * MINUTE_MS);
  await assert.rejects(disabling, { code: 'APPLICATION_LOCKED' });
  assert.deepEqual(service.getStatus(), { enabled: true, locked: true, timeoutMinutes: 5 });
  assert.equal(new AppLockService(options).getStatus().enabled, true);
});

test('a failed atomic write leaves the current protection unchanged', async t => {
  const { filePath, service } = await fixture(t);
  await mkdir(filePath, { recursive: true });
  await assert.rejects(service.configure({ password: PASSWORD, timeoutMinutes: 5 }));
  assert.deepEqual(service.getStatus(), { enabled: false, locked: false, timeoutMinutes: 5 });
});

test('an invalid persisted verifier does not silently disable protection', async t => {
  const { filePath, options } = await fixture(t);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ version: 1, timeoutMinutes: 5, credential: { salt: '', hash: '' } }));
  assert.throws(() => new AppLockService(options), /настройки блокировки/i);
});
