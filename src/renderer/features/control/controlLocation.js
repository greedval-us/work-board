export function isClosedControl(route) {
  return route.query.closed === '1';
}

export function controlLocation(name, closed, query = {}) {
  return { name, query: closed ? { ...query, closed: '1' } : query };
}
