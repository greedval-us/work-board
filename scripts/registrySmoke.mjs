import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { app, dialog, ipcMain } from 'electron';
import { createWindow } from '../src/main/app.js';
import { createApplicationServices } from '../src/main/createApplicationServices.js';
import { startDesktopApplication } from '../src/main/startDesktopApplication.js';
import log from '../src/main/utils/logger.js';
import { PROJECT_ROOT } from './lib/runtime.mjs';
import { DesktopSmokeDriver } from './lib/DesktopSmokeDriver.mjs';
import { createSmokeFixture } from './smoke/fixture.mjs';
import { setupRegistry } from './smoke/setupRegistry.mjs';
import { verifyRegistry } from './smoke/verifyRegistry.mjs';
import { verifyControlCard } from './smoke/verifyControlCard.mjs';
import { verifyCalendar } from './smoke/verifyCalendar.mjs';
import { verifyAnalytics } from './smoke/verifyAnalytics.mjs';
import { verifyDatabaseSettings } from './smoke/verifyDatabaseSettings.mjs';
import { verifyCheckpointNotifications } from './smoke/verifyCheckpointNotifications.mjs';
import { verifyMotion } from './smoke/verifyMotion.mjs';

const SMOKE_TIMEOUT_MS = 80_000;
const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
const fixture = createSmokeFixture(userData, dialog);
const timeout = setTimeout(() => { console.error('Registry desktop smoke timed out.'); app.exit(1); }, SMOKE_TIMEOUT_MS);
const output = process.env.WORK_BOARD_SMOKE_OUTPUT ?? path.join(PROJECT_ROOT, 'output');
mkdirSync(output, { recursive: true });

app.once('browser-window-created', (_event, window) => {
  const driver = new DesktopSmokeDriver(window, { output });
  driver.prepare();
  window.webContents.once('did-finish-load', async () => {
    try {
      const initial = await setupRegistry(driver, fixture);
      await verifyRegistry(driver, fixture, initial);
      await verifyControlCard(driver, fixture, initial);
      const calendar = await verifyCalendar(driver, fixture, initial);
      await verifyAnalytics(driver, fixture, initial);
      const { reopened } = await verifyDatabaseSettings(driver, fixture, { ...initial, ...calendar });
      await verifyCheckpointNotifications(driver, fixture, { created: initial.created, reopened });
      await verifyMotion(driver);
      assert.deepEqual(driver.errors, []);
      window.webContents.debugger.detach();
      clearTimeout(timeout);
      console.log('Registry desktop smoke passed: create/open DB, dropdown settings, CRUD UI, attachments/download/discard, analytics/filter/empty state, 27-row Excel, F-21 Word export, calendar, checkpoint filters and marks, generation isolation, unsaved close guard, light/dark, compact window.');
      app.quit();
    } catch (error) {
      console.error(error);
      try { await driver.screenshot('registry-smoke-failure.png'); } catch {}
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});

// Keep fallback/in-app scenarios; native delivery and tray have a separate smoke.
startDesktopApplication({ app, dialog, ipcMain, createWindow, createServices: createApplicationServices,
  createTray: () => { throw new Error('Tray unavailable in fallback smoke scenario.'); },
  buildMenu: template => template, logger: { error: (...args) => {
    if (args.some(value => value?.message === 'Tray unavailable in fallback smoke scenario.')) return;
    log.error(...args);
  } },
});
