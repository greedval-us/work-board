import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { DesktopError, ERROR_CODES } from '../../src/shared/errors.js';
import { useErrorStore } from '../../src/renderer/stores/errorStore.js';
import { installErrorHandling } from '../../src/renderer/infrastructure/installErrorHandling.js';

test('unexpected renderer exceptions stay out of user-visible state', () => {
  const errors = useErrorStore(createPinia());
  const raw = new Error('SELECT secret FROM C:/private/customer.sqlite');
  errors.report(raw);
  assert.doesNotMatch(JSON.stringify(errors.$state), /secret|private|customer/);
  errors.report(new DesktopError(ERROR_CODES.DATABASE_LOCKED));
  assert.match(errors.notification.message, /занят/);
  assert.equal(errors.notification.id, 2);
  errors.dismiss();
  assert.equal(errors.notification, null);
});

test('Vue and browser failures report once and handlers can be removed', () => {
  const listeners = new Map();
  const reports = [];
  const logs = [];
  const previous = () => {};
  const app = { config: { errorHandler: previous } };
  const remove = installErrorHandling({
    app, errors: { report: error => reports.push(error) },
    logger: { error: (...args) => logs.push(args) },
    target: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
  });
  const error = new Error('test failure');
  app.config.errorHandler(error, null, 'event handler');
  let prevented = false;
  listeners.get('unhandledrejection')({ reason: error, preventDefault: () => { prevented = true; } });
  listeners.get('error')({ message: 'missing image' });
  assert.equal(prevented, true);
  assert.deepEqual(reports, [error, error]);
  assert.equal(logs.length, 2);
  remove();
  assert.equal(app.config.errorHandler, previous);
  assert.equal(listeners.size, 0);
});
