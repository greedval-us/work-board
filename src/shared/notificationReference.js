export function notificationReference({ id, occurrence }) {
  return { id, occurrence };
}

export function notificationKey({ id, occurrence }) {
  return JSON.stringify([id, occurrence]);
}

export function isPlanNotification(kind) {
  return kind === 'plan' || kind === 'planCheckpoint';
}

export function notificationTitle(item) {
  return item.planItem ? `${item.title} · ${item.planItem}` : item.title;
}
