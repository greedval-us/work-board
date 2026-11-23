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
    getPending(key) { return pending.get(key); },
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
  const accepts = key => latest?.key === key && latest.isCurrent();
  return {
    issue(key) { latest = scope.issue(key); return latest; },
    // A shared operation may publish for a later caller of the same key, while
    // each caller's own ticket still controls its error/loading cleanup.
    accepts,
    hasPending(key) { return Boolean(flight.getPending(key)); },
    run(key, operation) {
      // Invalidation may start a replacement request with the very same key.
      const canPublish = () => accepts(key) && flight.getPending(key) === promise;
      const promise = flight.run(key, () => operation(canPublish));
      return promise;
    },
    invalidate() { scope.invalidate(); flight.clear(); },
    dispose() { scope.dispose(); flight.clear(); },
  };
}
