import { rethrowAfterCleanup } from '../errors/cleanup.js';

export function runTransaction(connection, operation, { deferred = false } = {}) {
  if (typeof operation !== 'function' || operation.constructor?.name === 'AsyncFunction') throw new TypeError('Транзакция принимает только синхронную операцию.');
  connection.exec(deferred ? 'BEGIN' : 'BEGIN IMMEDIATE');
  try {
    const result = operation();
    if (result && typeof result.then === 'function') throw new TypeError('Транзакция должна завершаться синхронно.');
    connection.exec('COMMIT');
    return result;
  } catch (error) {
    rethrowAfterCleanup(error, [() => connection.exec('ROLLBACK')]);
  }
}
