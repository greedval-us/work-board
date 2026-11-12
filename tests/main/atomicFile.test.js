import assert from 'node:assert/strict';
import filesystemSync from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import filesystem from 'node:fs/promises';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { copyAtomicFile, writeAtomicFile } from '../../src/main/files/atomicFile.js';
import { CleanupError } from '../../src/main/utils/cleanup.js';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'work-board-atomic-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'report.txt');
  await writeFile(filePath, 'previous report');
  return { directory, filePath };
}

test('atomic writes replace a complete file and leave no temporary file', async t => {
  const { directory, filePath } = await fixture(t);
  assert.equal(await writeAtomicFile(filePath, 'complete report'), filePath);
  assert.equal(await readFile(filePath, 'utf8'), 'complete report');
  assert.deepEqual(await readdir(directory), ['report.txt']);
});

test('failed content writes preserve the destination and remove partial temporary data', async t => {
  const { directory, filePath } = await fixture(t);
  const failure = new Error('content generation failed');
  async function* contents() { yield 'partial'; throw failure; }
  await assert.rejects(writeAtomicFile(filePath, contents()), error => error === failure);
  assert.equal(await readFile(filePath, 'utf8'), 'previous report');
  assert.deepEqual(await readdir(directory), ['report.txt']);
});

test('failed replacement removes the temporary file and leaves the existing directory intact', async t => {
  const { directory } = await fixture(t);
  const destination = path.join(directory, 'existing-directory');
  await mkdir(destination);
  await assert.rejects(writeAtomicFile(destination, 'report'));
  assert.deepEqual((await readdir(directory)).sort(), ['existing-directory', 'report.txt']);
  assert.deepEqual(await readdir(destination), []);
});

test('a stale operation cannot publish a completed copy', async t => {
  const { directory, filePath } = await fixture(t);
  const source = path.join(directory, 'source.txt');
  await writeFile(source, 'source contents');
  const stale = new Error('database changed');
  await assert.rejects(copyAtomicFile(source, filePath, { assertCurrent() { throw stale; } }), error => error === stale);
  assert.equal(await readFile(filePath, 'utf8'), 'previous report');
  assert.deepEqual((await readdir(directory)).sort(), ['report.txt', 'source.txt']);
});

test('failed cleanup retains the original operation error and secondary diagnostics', async t => {
  const { filePath } = await fixture(t);
  const original = new Error('original write failure');
  const cleanup = new Error('cleanup failure');
  const mocked = t.mock.method(filesystem, 'rm', async () => { throw cleanup; });
  try {
    await assert.rejects(writeAtomicFile(filePath, 'new contents', { assertCurrent() { throw original; } }), error => {
      assert.ok(error instanceof CleanupError);
      assert.equal(error.cause, original);
      assert.deepEqual(error.errors, [original, cleanup]);
      return true;
    });
  } finally { mocked.mock.restore(); }
  assert.equal(await readFile(filePath, 'utf8'), 'previous report');
});

test('exclusive temporary creation failure never removes an unowned path', async t => {
  const exists = Object.assign(new Error('already exists'), { code: 'EEXIST' });
  t.mock.method(filesystem, 'open', async () => { throw exists; });
  const cleanup = t.mock.method(filesystem, 'rm', async () => { throw new Error('must not clean unowned file'); });
  await assert.rejects(writeAtomicFile(path.join(process.cwd(), 'report.txt'), 'report'), error => error === exists);
  assert.equal(cleanup.mock.callCount(), 0);
});

test('database filename aliases protect companions of both the alias and resolved database', async t => {
  const alias = path.join(process.cwd(), 'alias.sqlite');
  const actual = path.join(process.cwd(), 'actual.sqlite');
  const realpath = filesystemSync.realpathSync;
  const resolver = t.mock.method(filesystemSync, 'realpathSync', filePath => filePath === alias ? actual : realpath(filePath));
  const opened = t.mock.method(filesystem, 'open', async () => { throw new Error('must not write a database companion'); });
  syncBuiltinESMExports();
  try {
    for (const databasePath of [alias, actual]) {
      for (const suffix of ['', '-wal', '-shm']) {
        await assert.rejects(writeAtomicFile(`${databasePath}${suffix}`, 'report', { getDatabasePaths: () => [alias] }), { code: 'VALIDATION' });
      }
    }
    assert.equal(opened.mock.callCount(), 0);
  } finally {
    resolver.mock.restore();
    syncBuiltinESMExports();
  }
});

test('database files, WAL, SHM and attachment destinations are protected through directory aliases', async t => {
  const { directory } = await fixture(t);
  const databasePath = path.join(directory, 'board.sqlite');
  for (const suffix of ['', '-wal', '-shm']) await writeFile(`${databasePath}${suffix}`, 'database data');
  const storage = `${databasePath}.files`;
  await mkdir(storage);
  const alias = path.join(directory, 'alias');
  await symlink(storage, alias, 'junction');
  for (const destination of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, storage, path.join(alias, 'report.txt')]) {
    await assert.rejects(writeAtomicFile(destination, 'report', { getDatabasePaths: () => [databasePath] }), { code: 'VALIDATION' });
  }
  for (const suffix of ['', '-wal', '-shm']) assert.equal(await readFile(`${databasePath}${suffix}`, 'utf8'), 'database data');
  assert.deepEqual(await readdir(storage), []);
});
