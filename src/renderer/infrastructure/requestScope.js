// One scope per independently refreshable resource. Invalidated replies may finish,
// but must never replace data from a newer request or another database.
export function createRequestScope() {
  let revision = 0;
  let disposed = false;
  return {
    issue(key) {
      const issuedRevision = ++revision;
      return { key, isCurrent: () => !disposed && issuedRevision === revision };
    },
    invalidate() { revision++; },
    dispose() { disposed = true; revision++; },
  };
}

// Deduplicate pending work only; successful data caching belongs to the store.
export function createSingleFlight() {
  const pending = new Map();
  return {
    run(key, operation) {
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(operation).finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
    clear() { pending.clear(); },
  };
}

// Keep request validity and pending work in the same lifecycle. Stores choose
// when to issue a ticket and continue to own query keys, caches and UI state.
export function createRequestChannel() {
  const scope = createRequestScope();
  const flight = createSingleFlight();
  let latest;
  return {
    issue(key) { latest = scope.issue(key); return latest; },
    // A shared operation may publish for a later caller of the same key, while
    // each caller's own ticket still controls its error/loading cleanup.
    accepts(key) { return latest?.key === key && latest.isCurrent(); },
    run: flight.run,
    invalidate() { scope.invalidate(); flight.clear(); },
    dispose() { scope.dispose(); flight.clear(); },
  };
}
