import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DesktopError, defaultErrorMessage } from '../../src/shared/errors.js';
import { ValidationError } from '../../src/shared/registry.js';
import { validateTheme } from '../../src/shared/constants/settings.js';

test('unknown and inherited error codes resolve to a safe unexpected failure', () => {
  for (const code of ['SQLITE_ERROR', 'toString', 'constructor', '__proto__', null, {}]) {
    assert.equal(typeof defaultErrorMessage(code), 'string');
    const error = new DesktopError(code, 'SELECT * FROM private_data');
    assert.equal(error.code, 'UNEXPECTED');
    assert.equal(error.publicMessage, defaultErrorMessage('UNEXPECTED'));
    assert.doesNotMatch(error.message, /SELECT|private_data/);
  }
});

test('theme validation uses the same safe validation contract as business forms', () => {
  assert.throws(() => validateTheme('dark; SELECT * FROM private_data'), (error) => {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.code, 'VALIDATION');
    assert.match(error.publicMessage, /тема/);
    assert.doesNotMatch(error.publicMessage, /SELECT|private_data/);
    return true;
  });
});
