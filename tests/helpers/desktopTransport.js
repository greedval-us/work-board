// Model the actual preload transport while keeping store fixtures concise.
export function transportFixture(namespaces) {
  return Object.fromEntries(Object.entries(namespaces).map(([namespace, methods]) => [
    namespace,
    Object.fromEntries(Object.entries(methods).map(([method, operation]) => [
      method, async (...args) => ({ ok: true, value: await operation(...args) }),
    ])),
  ]));
}
