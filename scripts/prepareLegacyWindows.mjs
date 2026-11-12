import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NtExecutable } from 'pe-library';
import packaging from '../electron-builder.legacy.config.cjs';
import { PROJECT_ROOT as root, readProjectMetadata, runProcess } from './lib/runtime.mjs';

const stage = path.resolve(root, packaging.directories.app);
const dependencyDirectory = path.join(root, 'packaging/legacy');
const dependencies = JSON.parse(readFileSync(path.join(dependencyDirectory, 'package.json'), 'utf8')).dependencies;
const metadata = readProjectMetadata();
for (const [name, version] of Object.entries(dependencies)) {
  if (name !== 'better-sqlite3') assert.equal(version, metadata.dependencies[name], `Update legacy lockfile for ${name}.`);
}
mkdirSync(stage, { recursive: true });
// These are generated copies owned by this build, never the source directories.
for (const directory of ['src', 'build']) {
  const target = path.resolve(stage, directory);
  assert.equal(path.dirname(target), stage);
  assert.ok(stage.startsWith(path.join(root, '.cache') + path.sep));
  rmSync(target, { recursive: true, force: true });
}
for (const directory of ['src/main', 'src/shared', 'build/main', 'build/renderer', 'build/legacy']) {
  cpSync(path.join(root, directory), path.join(stage, directory), { recursive: true });
}
const { devDependencies, scripts, overrides, engines, ...application } = metadata;
writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
  ...application, main: 'build/legacy/main.cjs', dependencies,
}, null, 2) + '\n');
cpSync(path.join(dependencyDirectory, 'package-lock.json'), path.join(stage, 'package-lock.json'));

async function run(command, args, cwd = stage) {
  const code = await runProcess(command, args, { cwd, stdio: 'inherit', timeoutMs: 300_000,
    env: { ...process.env, npm_config_cache: path.join(root, '.npm') } });
  if (code !== 0) throw new Error(`${path.basename(command)} failed (${code}).`);
}

// Running npm's JS entry avoids quoting paths through cmd.exe on Windows.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Use npm run prepare:win:legacy.');
await run(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(root, '.npm')]);
await run(process.execPath, [path.join(stage, 'node_modules/prebuild-install/bin.js'),
  '--runtime=electron', `--target=${packaging.electronVersion}`, '--arch=ia32', '--platform=win32'],
path.join(stage, 'node_modules/better-sqlite3'));
const native = NtExecutable.from(readFileSync(path.join(stage, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')));
assert.equal(native.is32bit(), true, 'Legacy SQLite must be a 32-bit binary.');
console.log(`Legacy application prepared: Electron ${packaging.electronVersion}, ia32, SQLite ${dependencies['better-sqlite3']}.`);
