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
