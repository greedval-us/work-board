export function emptyAttachmentChanges() {
  return { add: [], remove: [] };
}

export function appendAttachmentSelections(changes, selections) {
  return { ...changes, add: [...changes.add, ...selections] };
}

export function toggleAttachmentRemoval(changes, file) {
  if (file.token) return { ...changes, add: changes.add.filter(item => item.token !== file.token) };
  const remove = changes.remove.includes(file.id) ? changes.remove.filter(id => id !== file.id) : [...changes.remove, file.id];
  return { ...changes, remove };
}

export function attachmentRows(files, changes) {
  return [...files.map(file => ({ ...file, removed: changes.remove.includes(file.id) })), ...changes.add];
}

// Build plain nested data: Electron cannot structured-clone Vue proxies.
export function snapshotAttachmentChanges(changes) {
  return { add: changes.add.map(file => ({ token: file.token })), remove: [...changes.remove] };
}
