import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CleanupError, rethrowAfterCleanup } from '../../src/main/utils/cleanup.js';
import { AppError } from '../../src/main/utils/AppError.js';
import { publicError } from '../../src/main/utils/publicError.js';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers.js';

test('cleanup attempts every resource and retains the original error without mutation', () => {
  const primary = Object.freeze(new Error('primary'));
  const first = new Error('first cleanup');
  const last = new Error('last cleanup');
  const attempted = [];
  assert.throws(() => rethrowAfterCleanup(primary, [
    () => { attempted.push('first'); throw first; },
    () => { attempted.push('second'); },
    () => { attempted.push('last'); throw last; },
  ]), error => {
    assert.ok(error instanceof CleanupError);
    assert.equal(error.cause, primary);
    assert.deepEqual(error.errors, [primary, first, last]);
    return true;
  });
  assert.deepEqual(attempted, ['first', 'second', 'last']);
});

test('successful cleanup rethrows the exact original failure, including non-Error values', () => {
  for (const failure of [new Error('primary'), null, undefined, 'failure']) {
    let cleaned = false;
    let caught = false;
    try { rethrowAfterCleanup(failure, [() => { cleaned = true; }]); }
    catch (error) { caught = true; assert.equal(error, failure); }
    assert.equal(cleaned, true);
    assert.equal(caught, true);
  }
});

test('IPC logs both failures but exposes only the classified primary error', async () => {
  const primary = new AppError('Активная база изменилась.', 'DATABASE_CHANGED');
  const secondary = new Error('private cleanup SQL at C:\\private\\database.sqlite');
  const failure = new CleanupError(primary, [secondary]);
  const handlers = new Map();
  const logged = [];
  registerIpcHandlers({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); }, removeHandler() {} },
    requests: { 'test:cleanup': () => { throw failure; } },
    isTrusted: () => true,
    logger: { error(...args) { logged.push(args); } },
  });
  assert.deepEqual(await handlers.get('test:cleanup')({}), {
    ok: false, error: { code: 'DATABASE_CHANGED', message: primary.publicMessage },
  });
  assert.equal(logged[0][2], failure);
  assert.deepEqual(logged[0][2].errors, [primary, secondary]);
});

test('public errors only unwrap trusted cleanup failures and never arbitrary causes', () => {
  const primary = new AppError('Публичная ошибка.', 'VALIDATION');
  const secondary = new Error('private failure');
  const nested = new CleanupError(new CleanupError(primary, [secondary]), [secondary]);
  assert.equal(publicError(nested).code, 'VALIDATION');
  assert.equal(publicError(new Error('private wrapper', { cause: primary })).code, 'UNEXPECTED');
  assert.equal(publicError(new AggregateError([primary], 'private wrapper', { cause: primary })).code, 'UNEXPECTED');
});
