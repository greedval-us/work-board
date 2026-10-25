import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { DesktopSmokeDriver, assertWorkspaceFits } from '../../scripts/lib/DesktopSmokeDriver.mjs';

function rendererDriver(state) {
  const context = createContext(state);
  return new DesktopSmokeDriver({ webContents: { executeJavaScript: source => runInContext(source, context) } }, {
    timing: { conditionAttempts: 2, conditionPollMs: 0 },
  });
}

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

function registryMeasurements() {
  return {
    width: 1000, height: 600, document: { width: 1001, height: 601 }, columns: 8, dates: [],
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
  measurements.columns = 7;
  assert.throws(() => assertWorkspaceFits(measurements, 'registry', 'fixture'));
  measurements.columns = 8;
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
