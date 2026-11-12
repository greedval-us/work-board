import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import asar from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import modernPackaging from '../electron-builder.config.cjs';
import {
  PROJECT_ROOT as root, createElectronEnvironment, readProjectMetadata, runProcess, TemporaryDirectory,
} from './lib/runtime.mjs';

const PACKAGED_DIRECTORIES = ['src/main', 'src/shared', 'build/main', 'build/renderer'];
const MIN_PACKAGE_BYTES = 50_000_000;
const ICON_RESOURCE_TYPE = 3;
const legacy = process.argv.includes('--legacy');
const packaging = legacy ? (await import('../electron-builder.legacy.config.cjs')).default : modernPackaging;
const metadata = readProjectMetadata();
const architecture = legacy ? 'ia32' : 'x64';
const electronVersion = legacy ? '22.3.27' : metadata.devDependencies.electron;
const releaseDirectory = path.join(root, packaging.directories.output);
const unpackedDirectory = path.join(releaseDirectory, legacy ? 'win-ia32-unpacked' : 'win-unpacked');
const archive = path.join(unpackedDirectory, 'resources/app.asar');
const executable = path.join(unpackedDirectory, `${packaging.productName}.exe`);
const suffix = legacy ? '-win7-10-ia32' : '';
const installer = path.join(releaseDirectory, `${packaging.productName} Setup ${metadata.version}${suffix}.exe`);
const portable = path.join(releaseDirectory, `${packaging.productName} ${metadata.version}${suffix}.exe`);
const nativeModuleRelative = 'node_modules/better-sqlite3/build/Release/better_sqlite3.node';
const nativeModule = path.join(`${archive}.unpacked`, nativeModuleRelative);

function requireFile(filename) {
  assert.ok(existsSync(filename) && statSync(filename).isFile(),
    `Missing ${architecture} package file: ${filename}. Build the ${legacy ? 'legacy' : 'modern'} Windows packages first.`);
}
for (const filename of [archive, executable, installer, portable, ...(legacy ? [nativeModule] : [])]) requireFile(filename);

let checked = 0;
function verifyFile(relative) {
  assert.deepEqual(asar.extractFile(archive, path.normalize(relative)), readFileSync(path.join(root, relative)),
    `${architecture} packaged file differs: ${relative}`);
  checked++;
}
function verifyDirectory(relative) {
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) verifyDirectory(name);
    else verifyFile(name);
  }
}
for (const directory of PACKAGED_DIRECTORIES) verifyDirectory(directory);
if (legacy) verifyFile('build/legacy/main.cjs');
assert.equal(JSON.parse(asar.extractFile(archive, path.normalize('node_modules/exceljs/package.json'))).version, metadata.dependencies.exceljs);
if (legacy) {
  assert.equal(packaging.electronVersion, electronVersion);
  assert.equal(JSON.parse(asar.extractFile(archive, path.normalize('node_modules/better-sqlite3/package.json'))).version, '9.6.0');
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).main, 'build/legacy/main.cjs');
  assert.deepEqual(asar.extractFile(archive, path.normalize(nativeModuleRelative)), readFileSync(nativeModule));
}

function verifyArchitecture(filename) {
  const pe = NtExecutable.from(readFileSync(filename), { ignoreCert: true });
  assert.equal(pe.newHeader.fileHeader.machine, legacy ? 0x14c : 0x8664,
    `${filename} must contain a ${architecture} PE binary`);
  assert.equal(pe.is32bit(), legacy, `${filename} has the wrong PE optional-header bitness`);
}
verifyArchitecture(executable);
if (legacy) verifyArchitecture(nativeModule);

// Inspect the PE resource tree, rather than accepting an icon copied next to an
// executable which still contains Electron's default icon.
function verifyWindowsIcon(filename) {
  const executable = NtExecutable.from(readFileSync(filename), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const expected = readFileSync(path.join(root, 'src/public/icons/app-256.png'));
  assert.ok(resources.entries.some(entry => entry.type === ICON_RESOURCE_TYPE && Buffer.from(entry.bin).equals(expected)),
    `Work Board icon missing in ${path.basename(filename)}`);
}

verifyWindowsIcon(executable);
const runtimeCheck = `
  const assert = require('node:assert/strict');
  const path = require('node:path');
  const fs = require('original-fs');
  const { createHash } = require('node:crypto');
  const [reportFile, expectedElectron, expectedArchitecture, databaseBackend] = process.argv.slice(2);
  assert.equal(process.versions.electron, expectedElectron);
  assert.equal(process.arch, expectedArchitecture);
  const archive = path.join(path.dirname(process.execPath), 'resources/app.asar');
  const isLegacy = databaseBackend === 'better-sqlite3';
  if (isLegacy) assert.equal(process.versions.modules, '110');
  const DatabaseSync = isLegacy
    ? require(path.join(archive, 'node_modules/better-sqlite3'))
    : require('node:sqlite').DatabaseSync;
  const ExcelJS = require(path.join(archive, 'node_modules/exceljs'));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE sample (value TEXT) STRICT');
  db.prepare('INSERT INTO sample VALUES (?)').run('0001/К');
  assert.equal(db.prepare('SELECT value FROM sample').get().value, '0001/К');
  db.close();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Указания').addRow(['0001/К']);
  workbook.xlsx.writeBuffer().then(async buffer => {
    assert.ok(buffer.byteLength > 1000);
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    assert.equal(reopened.getWorksheet('Указания').getCell('A1').value, '0001/К');
    const hashFile = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    fs.writeFileSync(reportFile, JSON.stringify({
      architecture: process.arch,
      electronVersion: process.versions.electron,
      executableHash: hashFile(process.execPath),
      archiveHash: hashFile(archive),
      ...(isLegacy ? { nativeModuleHash: hashFile(path.join(archive + '.unpacked', '${nativeModuleRelative}')) } : {}),
    }));
    console.log('Packaged Electron ' + process.arch + ': SQLite and ExcelJS round trip passed.');
  }).catch(error => { console.error(error); process.exitCode = 1; });
`;

const hashFile = filename => createHash('sha256').update(readFileSync(filename)).digest('hex');
const expectedReport = {
  architecture, electronVersion,
  executableHash: hashFile(executable), archiveHash: hashFile(archive),
  ...(legacy ? { nativeModuleHash: hashFile(nativeModule) } : {}),
};
const temporary = new TemporaryDirectory('work-board-package-check-');
try {
  const script = path.join(temporary.directory, 'runtime.cjs');
  writeFileSync(script, runtimeCheck);
  // NSIS wrappers are 32-bit regardless of payload. Execute the portable app and
  // compare the extracted runtime/archive hashes before its wrapper removes them.
  for (const [label, filename] of [['unpacked', executable], ['portable', portable]]) {
    const report = path.join(temporary.directory, `${label}.json`);
    const status = await runProcess(filename, [script, report, electronVersion, architecture, legacy ? 'better-sqlite3' : 'node:sqlite'], {
      env: createElectronEnvironment({ runAsNode: true }), stdio: 'inherit',
      timeoutMs: 120_000, label: `${architecture} ${label} package smoke`,
    });
    assert.equal(status, 0, `${architecture} ${label} runtime failed`);
    assert.ok(existsSync(report), `${architecture} ${label} runtime did not produce a successful smoke report`);
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), expectedReport,
      `${architecture} ${label} payload differs from the verified unpacked application`);
    console.log(`${architecture} ${label}: Electron version, architecture and payload hashes verified.`);
  }
} finally { temporary.remove(); }

console.log(`${architecture} packaged sources and build match: ${checked} files. Application icon and PE architecture verified.`);
for (const filename of [installer, portable]) {
  const stat = statSync(filename);
  assert.ok(stat.size > MIN_PACKAGE_BYTES, `${filename} is unexpectedly small`);
  verifyWindowsIcon(filename);
  console.log(`${path.basename(filename)}: ${stat.size} bytes, embedded icon verified.`);
}
