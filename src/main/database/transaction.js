export function runTransaction(connection, operation) {
  if (typeof operation !== 'function' || operation.constructor?.name === 'AsyncFunction') throw new TypeError('Транзакция принимает только синхронную операцию.');
  connection.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    if (result && typeof result.then === 'function') throw new TypeError('Транзакция должна завершаться синхронно.');
    connection.exec('COMMIT');
    return result;
  } catch (error) { connection.exec('ROLLBACK'); throw error; }
}
