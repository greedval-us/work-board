import assert from 'node:assert/strict';
import path from 'node:path';
import { AppLockService } from '../../src/main/services/AppLockService.js';
import { DEFAULT_APP_LOCK_TIMEOUT_MINUTES } from '../../src/shared/appLock.js';

export async function verifyStartup(driver, userData, continueStartup) {
  const { window, wait, js, fill, click, api, screenshot } = driver;
  const appearance = '[document.documentElement.dataset.appearanceStyle, document.documentElement.dataset.appearance]';
  assert.equal(window.isVisible(), true, 'Startup must show the window while services are pending.');
  await wait("Boolean(document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#startup-screen'))");
  assert.match(await js("document.querySelector('#startup-screen [role=status]').innerText"), /\S/);
  assert.ok(await js("document.querySelector('#startup-screen img').naturalWidth > 0"), 'Startup icon failed to load.');
  assert.equal(await js("Boolean(document.querySelector('.app-shell, .app-lock-screen[open]'))"), false);
  assert.deepEqual(await js(appearance), ['witcher', 'dark']);
  await screenshot('startup-screen.png');

  const password = 'startup-smoke-password';
  const timeoutMinutes = DEFAULT_APP_LOCK_TIMEOUT_MINUTES;
  const profile = new AppLockService({ filePath: path.join(userData, 'app-lock.json') });
  await profile.configure({ password, timeoutMinutes });
  continueStartup.resolve();

  await wait("document.querySelector('.app-lock-screen[open] input[name=unlock-password]') && !document.querySelector('#startup-screen')");
  assert.deepEqual(await js(appearance), ['witcher', 'dark'], 'Keep the startup palette when handing off to the password screen');
  assert.equal(await js("Boolean(document.querySelector('.app-shell'))"), false, 'Protected workspace mounted before unlock.');
  await fill('input[name=unlock-password]', { 0: password });
  await click('Разблокировать', '.app-lock-unlock-form button');
  await wait("document.querySelector('h1')?.textContent === 'Контроль реестра' && !document.querySelector('[aria-busy=true], #startup-screen, .app-lock-screen[open]')");
  await api('appLock', 'configure', { currentPassword: password, password: '', timeoutMinutes });
  console.log('Startup screen, locked profile and unlocked registry verified.');
}
