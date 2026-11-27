// Keep secondary cleanup failures for diagnostics without replacing the primary cause.
export class CleanupError extends AggregateError {
  constructor(cause, cleanupErrors) {
    super([cause, ...cleanupErrors], 'Не удалось завершить очистку после ошибки операции.', { cause });
    this.name = 'CleanupError';
  }
}

// Always attempt the remaining resources and keep failures in the order they occurred.
function finishCleanup(callbacks, failures) {
  for (const cleanup of callbacks) {
    try { cleanup(); }
    catch (failure) { failures.push(failure); }
  }
  if (failures.length > 1) throw new CleanupError(failures[0], failures.slice(1));
  if (failures.length === 1) throw failures[0];
}

export function runCleanup(callbacks) {
  finishCleanup(callbacks, []);
}

export function rethrowAfterCleanup(error, callbacks) {
  finishCleanup(callbacks, [error]);
}
