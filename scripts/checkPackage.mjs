import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import asar from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import packaging from '../electron-builder.config.cjs';
import { PROJECT_ROOT as root, createElectronEnvironment, readProjectMetadata, runProcessSync } from './lib/runtime.mjs';

const PACKAGED_DIRECTORIES = ['src/main', 'src/shared', 'build/main', 'build/renderer'];
const MIN_PACKAGE_BYTES = 50_000_000;
const ICON_RESOURCE_TYPE = 3;
const metadata = readProjectMetadata();
const releaseDirectory = path.join(root, packaging.directories.output);
const unpackedDirectory = path.join(releaseDirectory, 'win-unpacked');
const archive = path.join(unpackedDirectory, 'resources/app.asar');
let checked = 0;
function verifyDirectory(relative) {
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) verifyDirectory(name);
    else {
      assert.deepEqual(asar.extractFile(archive, name), readFileSync(path.join(root, name)), name);
      checked++;
    }
  }
}
for (const directory of PACKAGED_DIRECTORIES) verifyDirectory(directory);
assert.equal(JSON.parse(asar.extractFile(archive, path.normalize('node_modules/exceljs/package.json'))).version, metadata.dependencies.exceljs);

// Inspect the PE resource tree, rather than accepting an icon copied next to an
// executable which still contains Electron's default icon.
function verifyWindowsIcon(filename) {
  const executable = NtExecutable.from(readFileSync(filename), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const expected = readFileSync(path.join(root, 'src/public/icons/app-256.png'));
  assert.ok(resources.entries.some(entry => entry.type === ICON_RESOURCE_TYPE && Buffer.from(entry.bin).equals(expected)),
    `Work Board icon missing in ${path.basename(filename)}`);
}

const executable = path.join(unpackedDirectory, `${packaging.productName}.exe`);
verifyWindowsIcon(executable);
const runtimeCheck = `
  const assert = require('node:assert/strict');
  assert.equal(process.versions.electron, process.argv[2]);
  const { DatabaseSync } = require('node:sqlite');
  const ExcelJS = require(process.argv[1]);
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE sample (value TEXT) STRICT');
  db.prepare('INSERT INTO sample VALUES (?)').run('0001/К');
  assert.equal(db.prepare('SELECT value FROM sample').get().value, '0001/К');
  db.close();
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Указания').addRow(['0001/К']);
  workbook.xlsx.writeBuffer().then(buffer => {
    assert.ok(buffer.byteLength > 1000);
    console.log('Packaged Electron runtime: SQLite and ExcelJS passed.');
  }).catch(error => { console.error(error); process.exitCode = 1; });
`;
const status = runProcessSync(executable, ['-e', runtimeCheck, path.join(archive, 'node_modules/exceljs'), metadata.devDependencies.electron], {
  env: createElectronEnvironment({ runAsNode: true }), stdio: 'inherit',
});
assert.equal(status, 0);
console.log(`Packaged sources and build match: ${checked} files. Application icon verified.`);
for (const name of [`${packaging.productName} Setup ${metadata.version}.exe`, `${packaging.productName} ${metadata.version}.exe`]) {
  const filename = path.join(releaseDirectory, name);
  const stat = statSync(filename);
  assert.ok(stat.size > MIN_PACKAGE_BYTES);
  verifyWindowsIcon(filename);
  console.log(`${name}: ${stat.size} bytes, embedded icon verified.`);
}
