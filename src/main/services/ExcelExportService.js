import { localDate, normalizeListRequest } from '../../shared/registry.js';
import { writeAtomicFile } from '../files/atomicFile.js';
import { createRegistryWorkbook } from './RegistryWorkbook.js';

export class ExcelExportService {
  constructor({ database, instructions, dialog, getWindow }) { Object.assign(this, { database, instructions, dialog, getWindow }); }

  async export(request) {
    this.database.assertGeneration(request.generation);
    const normalized = normalizeListRequest(request);
    const snapshotDatabasePath = this.database.filePath;
    const exportedAt = new Date();
    if (normalized.filters.checkpoint && !normalized.today) normalized.today = localDate(exportedAt);
    // Snapshot all matching rows before the asynchronous native dialog.
    const rows = this.instructions.all(normalized);
    const result = await this.dialog.showSaveDialog(this.getWindow(), {
      title: 'Выгрузить реестр в Excel', defaultPath: `Указания ${localDate(exportedAt)}.xlsx`,
      filters: [{ name: 'Книга Excel', extensions: ['xlsx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { cancelled: true, count: rows.length };
    const selected = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`;
    const workbook = createRegistryWorkbook({ rows, request: normalized, exportedAt });
    const filePath = await writeAtomicFile(selected, Buffer.from(await workbook.xlsx.writeBuffer()), {
      getDatabasePaths: () => [snapshotDatabasePath, this.database.filePath],
    });
    return { cancelled: false, filePath, count: rows.length };
  }
}
