import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestScope, createSingleFlight } from '../../src/renderer/infrastructure/requestScope.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('new requests and database invalidation reject stale replies', () => {
  const scope = createRequestScope();
  const first = scope.issue('database-1');
  const second = scope.issue('database-1');
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  scope.invalidate();
  assert.equal(second.isCurrent(), false);
  const third = scope.issue('database-2');
  scope.dispose();
  assert.equal(third.isCurrent(), false);
  assert.equal(scope.issue('after-disposal').isCurrent(), false);
});

test('identical pending reads share one promise and can be retried after failure', async () => {
  const flight = createSingleFlight();
  let calls = 0;
  const operation = () => { calls++; throw new Error('expected test failure'); };
  const first = flight.run('query', operation);
  assert.equal(flight.run('query', operation), first);
  await assert.rejects(first, /expected test failure/);
  await assert.rejects(flight.run('query', operation));
  assert.equal(calls, 2);
});

test('completion before clear cannot remove newer pending work with the same key', async () => {
  const flight = createSingleFlight();
  const old = deferred();
  const current = deferred();
  const first = flight.run('query', () => old.promise);
  flight.clear();
  const second = flight.run('query', () => current.promise);
  old.resolve('old');
  await first;
  assert.equal(flight.run('query', () => assert.fail('duplicate request')), second);
  current.resolve('current');
  assert.equal(await second, 'current');
  assert.equal(await flight.run('query', () => 'fresh'), 'fresh');
});
