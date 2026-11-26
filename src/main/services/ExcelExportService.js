import { localDate, REGISTRY_REPORT_LABELS, REGISTRY_REPORT_TYPE } from '../../shared/registry.js';
import { writeAtomicFile } from '../files/atomicFile.js';
import { openSavedFile } from '../files/openSavedFile.js';
import { createControlWorkbook } from '../exports/excel/ControlWorkbook.js';
import { REGISTRY_REPORT } from '../exports/excel/workbookConfig.js';

export class ExcelExportService {
  constructor({ database, instructions, repository = instructions, report = REGISTRY_REPORT, dialog, getWindow, openPath, assertUnlocked = () => {} }) {
    Object.assign(this, { database, repository, report, dialog, getWindow, openPath, assertUnlocked });
  }

  async export(request) {
    this.database.assertGeneration(request.generation);
    const normalized = this.report.normalize(request);
    const snapshotDatabasePath = this.database.filePath;
    const exportedAt = new Date();
    const today = localDate(exportedAt);
    if (normalized.filters.checkpoint && !normalized.today) normalized.today = today;
    // Snapshot all matching rows before the asynchronous native dialog.
    const rows = normalized.reportType === REGISTRY_REPORT_TYPE.OVERDUE
      ? this.repository.overdueControls(today) : this.repository.all(normalized);
    const section = normalized.closed ? this.report.closedSection : this.report.sheet;
    const suffix = normalized.reportType === REGISTRY_REPORT_TYPE.FULL ? '' : REGISTRY_REPORT_LABELS[normalized.reportType].toLocaleLowerCase('ru-RU');
    const result = await this.dialog.showSaveDialog(this.getWindow(), {
      title: suffix ? `Выгрузить ${suffix} в Excel` : this.report.dialogTitle,
      defaultPath: `${section}${suffix ? ' — ' + suffix : ''} ${today}.xlsx`,
      filters: [{ name: 'Книга Excel', extensions: ['xlsx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    this.assertUnlocked();
    if (result.canceled || !result.filePath) return { cancelled: true, count: rows.length };
    const selected = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`;
    const workbook = createControlWorkbook({ rows, normalized, exportedAt, report: this.report });
    const filePath = await writeAtomicFile(selected, Buffer.from(await workbook.xlsx.writeBuffer()), {
      getDatabasePaths: () => [snapshotDatabasePath, this.database.filePath],
      assertCurrent: this.assertUnlocked,
    });
    const opened = await openSavedFile(filePath, this.openPath);
    return { cancelled: false, filePath, count: rows.length, opened };
  }
}
