import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import packaging from '../electron-builder.legacy.config.cjs';
import { createLegacyBuildConfig } from '../vite.legacy.config.js';
import {
  PROJECT_ROOT as root, createElectronEnvironment, readProjectMetadata,
  runProcess, TemporaryDirectory, writeElectronEntry,
} from './lib/runtime.mjs';

const metadata = readProjectMetadata();
const stagedApp = path.join(root, packaging.directories.app);
const unpacked = path.join(root, packaging.directories.output, 'win-ia32-unpacked');
const executableName = `${packaging.productName}.exe`;
const bundles = path.join(stagedApp, 'build/smoke');
const output = path.join(root, 'output/legacy-win32');
assert.ok(existsSync(path.join(unpacked, executableName)), 'Build the legacy Windows package before running its desktop smoke.');
assert.ok(existsSync(path.join(stagedApp, 'node_modules/better-sqlite3/package.json')), 'The legacy staging dependencies are missing.');
mkdirSync(output, { recursive: true });
mkdirSync(bundles, { recursive: true });

function writeRuntimeEntry(filename, body) {
  writeFileSync(filename, `
    const assert = require('node:assert/strict');
    assert.equal(process.platform, 'win32');
    assert.equal(process.arch, 'ia32');
    assert.equal(process.versions.electron, ${JSON.stringify(packaging.electronVersion)});
    assert.equal(process.versions.modules, '110');
    ${body}
  `);
}

// Packaged Electron always loads resources/app.asar. Give an isolated copy of
// that same runtime a test entry, without changing the distributable or profile.
const runtime = new TemporaryDirectory('work-board-legacy-runtime-');
try {
  cpSync(unpacked, runtime.directory, { recursive: true, filter: source => {
    const relative = path.relative(unpacked, source).split(path.sep).join('/');
    return relative !== 'resources/app.asar' && relative !== 'resources/app.asar.unpacked'
      && !relative.startsWith('resources/app.asar.unpacked/');
  } });
  const testApp = path.join(runtime.directory, 'resources/app');
  mkdirSync(testApp, { recursive: true });
  const runEntry = async (entry, name, timeoutMs) => {
    // Electron 22 joins package.main to the package directory, even for an
    // absolute path. Keep main relative and require the external test explicitly.
    writeFileSync(path.join(testApp, 'entry.cjs'), `
      const { app, dialog } = require('electron');
      const fail = error => { console.error(error); app.exit(1); };
      process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
      dialog.showErrorBox = (title, message) => fail(new Error(title + ': ' + message));
      console.log(${JSON.stringify(`Starting legacy ${name} desktop smoke.`)});
      require(${JSON.stringify(entry)});
    `);
    writeElectronEntry(testApp, metadata, 'entry.cjs');
    const profile = new TemporaryDirectory(`work-board-legacy-${name}-`);
    try {
      const status = await runProcess(path.join(runtime.directory, executableName), [], {
        cwd: root, stdio: 'inherit', timeoutMs, label: `Legacy ${name} desktop smoke`,
        env: createElectronEnvironment({ overrides: {
          WORK_BOARD_SMOKE_USER_DATA: profile.directory, WORK_BOARD_SMOKE_OUTPUT: output,
        } }),
      });
      assert.equal(status, 0, `Legacy ${name} desktop smoke failed.`);
    } finally { profile.remove(); }
  };

  // Load the exact production bundle and its assets from app.asar before the
  // injected scenarios, to catch packaging and CommonJS entrypoint failures.
  const startupEntry = path.join(bundles, 'packaged-startup-entry.cjs');
  writeRuntimeEntry(startupEntry, `
    const { app, dialog } = require('electron');
    const { setTimeout: delay } = require('node:timers/promises');
    app.setPath('userData', process.env.WORK_BOARD_SMOKE_USER_DATA);
    const errors = [];
    const fail = error => { console.error(error); app.exit(1); };
    process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
    dialog.showErrorBox = (title, message) => fail(new Error(title + ': ' + message));
    const timeout = setTimeout(() => fail(new Error('Packaged legacy startup timed out.')), 15000);
    app.once('browser-window-created', (_event, window) => {
      window.setOpacity(0); window.setSkipTaskbar(true); window.setIgnoreMouseEvents(true);
      window.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message));
      window.webContents.on('console-message', (details, level, message) => {
        if (level === 3 || details.level === 'error') errors.push(message ?? details.message);
      });
      window.webContents.once('did-finish-load', async () => {
        try {
          let ready = false;
          for (let attempt = 0; attempt < 100 && !ready; attempt++) {
            ready = await window.webContents.executeJavaScript(
              'Boolean(window.desktopAPI?.database) && document.querySelector("h1")?.textContent === "Реестр указаний" && !document.querySelector("[aria-busy=true]")');
            if (!ready) await delay(50);
          }
          assert.equal(ready, true, 'Packaged renderer did not become ready.');
          const status = await window.webContents.executeJavaScript('window.desktopAPI.database.getStatus()');
          assert.equal(status.ok, true); assert.equal(status.value.ready, false);
          assert.deepEqual(errors, []); clearTimeout(timeout);
          console.log('Packaged legacy main, preload, renderer and IPC startup passed.');
          app.exit(0);
        } catch (error) { clearTimeout(timeout); fail(error); }
      });
    });
    require(${JSON.stringify(path.join(unpacked, 'resources/app.asar/build/legacy/main.cjs'))});
  `);
  await runEntry(startupEntry, 'startup', 25_000);

  for (const [name, timeoutMs] of [['registry', 90_000], ['background', 45_000]]) {
    await build({
      ...createLegacyBuildConfig({ entry: `scripts/${name}Smoke.mjs`, outDir: bundles,
        fileName: `${name}.cjs`, emptyOutDir: false }),
      configFile: false,
    });
    const entry = path.join(bundles, `${name}-entry.cjs`);
    writeRuntimeEntry(entry, `require(${JSON.stringify(`./${name}.cjs`)});`);
    await runEntry(entry, name, timeoutMs);
  }
  console.log('Legacy Electron ia32 desktop smokes passed: registry, exports, checkpoint dates and background reminders.');
} finally { runtime.remove(); }
