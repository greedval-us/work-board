import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createContext, runInContext } from 'node:vm';
import { DesktopSmokeDriver, assertWorkspaceFits } from '../../scripts/lib/DesktopSmokeDriver.mjs';
import { INSTRUCTION_COLUMNS } from '../../src/shared/constants/registry.js';

function rendererDriver(state) {
  const context = createContext(state);
  return new DesktopSmokeDriver({ webContents: { executeJavaScript: source => runInContext(source, context) } }, {
    timing: { conditionAttempts: 2, conditionPollMs: 0 },
  });
}

test('desktop smoke leaves the startup show callback in place and shows the window without focus', async () => {
  const webContents = Object.assign(new EventEmitter(), { setBackgroundThrottling() {} });
  const window = Object.assign(new EventEmitter(), {
    webContents, setOpacity() {}, setSkipTaskbar() {}, setIgnoreMouseEvents() {},
    show: () => assert.fail('Smoke window took focus.'),
    showInactive() { this.emit('show'); },
  });
  let shown = false;
  window.once('show', () => { shown = true; });
  new DesktopSmokeDriver(window).prepare();
  window.once('ready-to-show', () => window.show());
  await Promise.resolve();
  window.emit('ready-to-show');
  assert.equal(shown, true);
});

test('desktop smoke records renderer failures from both Electron console event formats', async () => {
  const webContents = Object.assign(new EventEmitter(), { setBackgroundThrottling() {} });
  const window = Object.assign(new EventEmitter(), {
    webContents, setOpacity() {}, setSkipTaskbar() {}, setIgnoreMouseEvents() {},
  });
  const driver = new DesktopSmokeDriver(window, {});
  driver.prepare();
  webContents.emit('console-message', {}, 3, 'Legacy renderer failed');
  webContents.emit('console-message', { level: 'error', message: 'Modern renderer failed' });
  webContents.emit('console-message', {}, 2, 'Legacy warning');
  webContents.emit('console-message', { level: 'warning', message: 'Modern warning' });
  webContents.emit('preload-error', {}, 'preload.cjs', new Error('Preload failed'));
  await Promise.resolve();
  assert.deepEqual(driver.errors, ['Legacy renderer failed', 'Modern renderer failed', 'Preload failed']);
});

test('desktop smoke IPC returns envelope values and preserves application failure codes', async () => {
  const driver = rendererDriver({ window: { desktopAPI: { database: {
    getStatus: () => ({ ok: true, value: { ready: false } }),
    open: () => ({ ok: false, error: { message: 'Database changed', code: 'STALE_GENERATION' } }),
    malformed: () => ({ ready: true }),
  } } } });
  assert.equal((await driver.api('database', 'getStatus')).ready, false);
  await assert.rejects(driver.api('database', 'open'), { message: 'Database changed', code: 'STALE_GENERATION' });
  await assert.rejects(driver.api('database', 'malformed'), /explicit result envelope/);
});

test('desktop smoke polling retries renderer conditions and reports exhausted conditions', async () => {
  const driver = rendererDriver({ attempts: 0 });
  await driver.wait('++attempts === 2');
  assert.equal(await driver.js('attempts'), 2);
  await assert.rejects(driver.wait('false'), /Renderer condition not met: false/);
});

test('ordinary smoke navigation waits for the destination even when motion is disabled', async () => {
  const heading = { textContent: 'Реестр указаний' };
  const elements = {
    h1: heading,
    'nav a[href="#/calendar"]': { click() { heading.textContent = 'Календарь и задачи'; } },
    '.page': { getAnimations: () => [] },
  };
  const driver = rendererDriver({
    document: { querySelector: selector => elements[selector] },
    requestAnimationFrame: callback => callback(),
    getComputedStyle: () => ({ opacity: '1', transform: 'none' }),
  });

  await driver.navigate('/calendar', 'Календарь и задачи');
  await assert.rejects(driver.navigate('/calendar', 'Настройки'), /Renderer condition not met/);
});

function registryMeasurements() {
  return {
    width: 1000, height: 600, document: { width: 1001, height: 601 }, columns: INSTRUCTION_COLUMNS.length + 1, dates: [],
    elements: {
      '.main-content': { y: 0, right: 1000, bottom: 600, clientHeight: 600, scrollHeight: 601 },
      '.page': { right: 1000, bottom: 600 },
      '.registry-toolbar': { y: 0, right: 1000, bottom: 40 },
      '.registry-pagination': { y: 560, right: 1000, bottom: 600 },
      '.registry-table-scroll': { height: 120, scrollWidth: 1001, clientWidth: 1000 },
      '.registry-table thead': { height: 30 },
      '.registry-table tbody tr': { height: 30 },
    },
  };
}

test('workspace geometry tolerates subpixel rounding but rejects document and table overflow', () => {
  const measurements = registryMeasurements();
  assert.doesNotThrow(() => assertWorkspaceFits(measurements, 'registry', 'fixture'));
  measurements.document.width = 1002;
  assert.throws(() => assertWorkspaceFits(measurements, 'registry', 'fixture'), /document overflow/);
  measurements.document.width = 1000;
  measurements.elements['.registry-table-scroll'].scrollWidth = 1002;
  assert.throws(() => assertWorkspaceFits(measurements, 'registry', 'fixture'), /horizontal scrolling/);
});

test('registry geometry requires complete columns and space for three visible rows', () => {
  const measurements = registryMeasurements();
  measurements.columns--;
  assert.throws(() => assertWorkspaceFits(measurements, 'registry', 'fixture'));
  measurements.columns++;
  measurements.elements['.registry-table-scroll'].height = 118;
  assert.throws(() => assertWorkspaceFits(measurements, 'registry', 'fixture'), /fewer than three visible rows/);
});

test('calendar geometry rejects a day outside the month grid', () => {
  const measurements = registryMeasurements();
  for (const selector of ['.calendar-page-heading', '.calendar-month-panel', '.calendar-day-panel', '.calendar-add-task']) {
    measurements.elements[selector] = { y: 0, right: 1000, bottom: 600 };
  }
  measurements.elements['.calendar-month-grid'] = { y: 50, right: 700, bottom: 550 };
  measurements.dates = Array.from({ length: 42 }, () => ({ y: 50, right: 700, bottom: 550 }));
  assert.doesNotThrow(() => assertWorkspaceFits(measurements, 'calendar', 'fixture'));
  measurements.dates[0].bottom = 552;
  assert.throws(() => assertWorkspaceFits(measurements, 'calendar', 'fixture'), /calendar dates are clipped/);
});
