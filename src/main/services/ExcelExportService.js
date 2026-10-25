import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { localDate, normalizeListRequest } from '../../shared/registry.js';
import { createRegistryWorkbook } from './RegistryWorkbook.js';

export class ExcelExportService {
  constructor({ database, instructions, dialog, getWindow }) { Object.assign(this, { database, instructions, dialog, getWindow }); }

  async export(request) {
    this.database.assertGeneration(request.generation);
    const normalized = normalizeListRequest(request);
    // Snapshot all matching rows before the asynchronous native dialog.
    const rows = this.instructions.all(normalized);
    const exportedAt = new Date();
    const result = await this.dialog.showSaveDialog(this.getWindow(), {
      title: 'Выгрузить реестр в Excel', defaultPath: `Указания ${localDate(exportedAt)}.xlsx`,
      filters: [{ name: 'Книга Excel', extensions: ['xlsx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { cancelled: true, count: rows.length };
    const filePath = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`;
    const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
    try {
      const workbook = createRegistryWorkbook({ rows, request: normalized, exportedAt });
      await writeFile(temporary, Buffer.from(await workbook.xlsx.writeBuffer()), { flag: 'wx' });
      await rename(temporary, filePath);
    } finally { await rm(temporary, { force: true }); }
    return { cancelled: false, filePath, count: rows.length };
  }
}
