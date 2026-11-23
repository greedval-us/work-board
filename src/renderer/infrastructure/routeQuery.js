import { validateDate } from '../../shared/dates.js';

export function queryId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function queryDate(value) {
  if (value === undefined) return '';
  try { return validateDate(value); } catch { return null; }
}

export function routeGuard(fields, matchesSelected, requestClose) {
  return (to, from) => {
    if (fields.every((field) => to.query[field] === from.query[field])) return true;
    const id = queryId(to.query[fields[0]]);
    // The selected card can differ from the URL after opening a table/list item.
    if (id !== null && matchesSelected(id, to.query)) return true;
    return requestClose();
  };
}
