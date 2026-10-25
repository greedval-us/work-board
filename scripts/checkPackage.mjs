import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import asar from '@electron/asar';
import { NtExecutable, NtExecutableResource } from 'pe-library';

const root = fileURLToPath(new URL('..', import.meta.url));
const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, 'release/win-unpacked/resources/app.asar');
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
for (const directory of ['src/main', 'src/shared', 'build/main', 'build/renderer']) verifyDirectory(directory);
assert.equal(JSON.parse(asar.extractFile(archive, path.normalize('node_modules/exceljs/package.json'))).version, metadata.dependencies.exceljs);

// Inspect the PE resource tree, rather than accepting an icon copied next to an
// executable which still contains Electron's default icon.
function verifyWindowsIcon(filename) {
  const executable = NtExecutable.from(readFileSync(filename), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const expected = readFileSync(path.join(root, 'src/public/icons/app-256.png'));
  assert.ok(resources.entries.some(entry => entry.type === 3 && Buffer.from(entry.bin).equals(expected)),
    `Work Board icon missing in ${path.basename(filename)}`);
}

const executable = path.join(root, 'release/win-unpacked/Work Board.exe');
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
const result = spawnSync(executable, ['-e', runtimeCheck, path.join(archive, 'node_modules/exceljs'), metadata.devDependencies.electron], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 30000,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) throw result.error;
assert.equal(result.status, 0);
console.log(`Packaged sources and build match: ${checked} files. Application icon verified.`);
for (const name of [`Work Board Setup ${metadata.version}.exe`, `Work Board ${metadata.version}.exe`]) {
  const filename = path.join(root, 'release', name);
  const stat = statSync(filename);
  assert.ok(stat.size > 50_000_000);
  verifyWindowsIcon(filename);
  console.log(`${name}: ${stat.size} bytes, embedded icon verified.`);
}
