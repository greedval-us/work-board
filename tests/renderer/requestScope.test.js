import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestChannel, createRequestScope, createSingleFlight } from '../../src/renderer/infrastructure/requestScope.js';

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

test('a request channel can accept shared work for the latest caller without reviving an older ticket', async () => {
  const channel = createRequestChannel();
  const pending = deferred();
  const first = channel.issue('first');
  const reading = channel.run('first', () => pending.promise);
  channel.issue('second');
  assert.equal(channel.accepts('first'), false);
  const returned = channel.issue('first');
  assert.equal(channel.run('first', () => assert.fail('duplicate read')), reading);
  assert.equal(first.isCurrent(), false);
  assert.equal(returned.isCurrent(), true);
  assert.equal(channel.accepts('first'), true);
  pending.resolve('shared');
  assert.equal(await reading, 'shared');
});

test('channel invalidation replaces pending work and disposal permanently rejects publication', async () => {
  const channel = createRequestChannel();
  const previous = deferred();
  const fresh = deferred();
  const first = channel.issue('query');
  const oldRead = channel.run('query', () => previous.promise);
  channel.invalidate();
  const second = channel.issue('query');
  const newRead = channel.run('query', () => fresh.promise);
  assert.notEqual(newRead, oldRead);
  assert.equal(first.isCurrent(), false);
  previous.resolve('old');
  await oldRead;
  assert.equal(channel.run('query', () => assert.fail('duplicate read')), newRead);
  assert.equal(channel.accepts('query'), true);
  channel.dispose();
  fresh.resolve('new');
  await newRead;
  assert.equal(second.isCurrent(), false);
  assert.equal(channel.accepts('query'), false);
  assert.equal(channel.issue('query').isCurrent(), false);
});
