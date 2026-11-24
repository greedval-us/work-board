import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, ipcMain, nativeTheme } from 'electron';
import { createWindow } from '../src/main/desktop/createWindow.js';
import { APP_APPEARANCE_STYLES } from '../src/shared/constants/settings.js';
import { STARTUP_CHANNEL } from '../src/shared/ipc/events.js';
import { deferred } from './lib/deferred.mjs';
import { DesktopSmokeDriver } from './lib/DesktopSmokeDriver.mjs';
import { PROJECT_ROOT } from './lib/runtime.mjs';

const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
app.on('window-all-closed', () => {});
const output = process.env.WORK_BOARD_SMOKE_OUTPUT ?? path.join(PROJECT_ROOT, 'output');
mkdirSync(output, { recursive: true });

async function verifyWindow(style, theme, systemMode) {
  const mode = theme === 'system' ? systemMode : theme;
  nativeTheme.themeSource = systemMode;
  writeFileSync(path.join(userData, 'startup-appearance.ini'), `[Appearance]\r\ntheme=${theme}\r\nstyle=${style}\r\n`);
  const services = deferred();
  ipcMain.handle(STARTUP_CHANNEL, () => services.promise);
  const { window, loaded } = createWindow();
  try {
    const driver = new DesktopSmokeDriver(window, { output });
    driver.prepare();
    await loaded;
    window.showInactive();
    const media = window.webContents.debugger;
    media.attach('1.3');
    const motion = value => media.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
    await motion('no-preference');
    const read = () => driver.js(`(() => {
      const track = document.querySelector('#startup-screen [role=progressbar]');
      const signal = track.querySelector('.startup-signal');
      const label = document.getElementById(track.getAttribute('aria-labelledby'));
      const { width, height } = track.getBoundingClientRect();
      return {
        style: document.documentElement.dataset.appearanceStyle, mode: document.documentElement.dataset.appearance,
        label: label?.textContent ?? track.getAttribute('aria-label'), art: getComputedStyle(document.querySelector('.startup-art')).backgroundImage,
        indeterminate: !track.hasAttribute('aria-valuenow'), width, height,
        visibleFill: signal.getBoundingClientRect().width > 0 && getComputedStyle(signal).visibility === 'visible',
        moving: signal.getAnimations().some(animation => animation.playState === 'running'),
      };
    })()`);
    await driver.animationFrames();
    const state = await read();
    assert.deepEqual([state.style, state.mode], [style, mode], 'First screen should use saved preferences before services start');
    assert.ok(state.label && state.indeterminate && state.width > 0 && state.height > 0 && state.visibleFill && state.moving,
      `Inactive or inaccessible loading bar for ${style}/${theme}: ${JSON.stringify(state)}`);
    if (theme !== 'system') await driver.screenshot(`startup-${style}-${mode}.png`);
    await motion('reduce');
    await driver.animationFrames();
    const reduced = await read();
    assert.ok(reduced.visibleFill && !reduced.moving, 'Reduced motion should preserve a visible, stationary loading bar');
    if (theme === 'system') {
      nativeTheme.themeSource = mode === 'dark' ? 'light' : 'dark';
      await driver.wait(`document.documentElement.dataset.appearance === '${nativeTheme.themeSource}'`);
      assert.equal((await read()).style, style);
    }
    assert.deepEqual(driver.errors, []);
    return state.art;
  } finally {
    window.destroy();
    services.resolve();
    ipcMain.removeHandler(STARTUP_CHANNEL);
  }
}

app.whenReady().then(async () => {
  const original = nativeTheme.themeSource;
  try {
    for (const mode of ['light', 'dark']) {
      const art = new Set();
      for (const style of Object.keys(APP_APPEARANCE_STYLES)) {
        art.add(await verifyWindow(style, mode, mode === 'light' ? 'dark' : 'light'));
      }
      assert.equal(art.size, Object.keys(APP_APPEARANCE_STYLES).length, 'Every style has distinct startup artwork');
      await verifyWindow('gzhel', 'system', mode);
    }
    console.log('Verified 10 startup styles/modes, both system modes, animated and reduced-motion bars before service initialization.');
  } finally { nativeTheme.themeSource = original; }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
