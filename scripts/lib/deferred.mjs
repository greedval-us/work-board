// Promise.withResolvers is unavailable in the legacy Electron 22 runtime.
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((fulfill, fail) => { resolve = fulfill; reject = fail; });
  return { promise, resolve, reject };
}
