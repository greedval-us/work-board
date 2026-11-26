import { INSTRUCTION_COLUMNS } from './constants/registry.js';
import { normalizeControlListRequest, normalizeControlExportRequest } from './controlRequests.js';

export { emptyFilters, normalizeFilters } from './controlRequests.js';

export function normalizeListRequest(value = {}) {
  return normalizeControlListRequest(value, INSTRUCTION_COLUMNS);
}

export function normalizeExportRequest(value = {}) {
  return normalizeControlExportRequest(value, INSTRUCTION_COLUMNS);
}
