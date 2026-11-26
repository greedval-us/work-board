import { createControlWorkbook } from './ControlWorkbook.js';
import { REGISTRY_REPORT } from './workbookConfig.js';

export function createRegistryWorkbook({ rows, request = {}, exportedAt = new Date() }) {
  return createControlWorkbook({ rows, normalized: REGISTRY_REPORT.normalize(request), exportedAt, report: REGISTRY_REPORT });
}
