// Keep secondary cleanup failures for diagnostics without replacing the primary cause.
export class CleanupError extends AggregateError {
  constructor(cause, cleanupErrors) {
    super([cause, ...cleanupErrors], 'Не удалось завершить очистку после ошибки операции.', { cause });
    this.name = 'CleanupError';
  }
}

// Synchronous transactions and connection disposal must finish every cleanup attempt.
export function rethrowAfterCleanup(error, callbacks) {
  const failures = [];
  for (const cleanup of callbacks) {
    try { cleanup(); }
    catch (failure) { failures.push(failure); }
  }
  if (failures.length) throw new CleanupError(error, failures);
  throw error;
}
