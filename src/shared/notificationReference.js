export function notificationReference({ id, occurrence }) {
  return { id, occurrence };
}

export function notificationKey({ id, occurrence }) {
  return JSON.stringify([id, occurrence]);
}
