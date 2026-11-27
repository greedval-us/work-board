import { localDate, REGISTRY_REPORT_LABELS, REGISTRY_REPORT_TYPE } from '../../shared/registry.js';
import { saveExportFile } from '../exports/saveExportFile.js';
import { createControlWorkbook } from '../exports/excel/ControlWorkbook.js';
import { REGISTRY_REPORT } from '../exports/excel/workbookConfig.js';

export class ExcelExportService {
  constructor({ database, instructions, repository = instructions, report = REGISTRY_REPORT, ...fileOptions }) {
    Object.assign(this, { database, repository, report, fileOptions });
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
    const result = await saveExportFile(this.fileOptions, {
      title: suffix ? `Выгрузить ${suffix} в Excel` : this.report.dialogTitle,
      defaultName: `${section}${suffix ? ' — ' + suffix : ''} ${today}`,
      fileType: 'Книга Excel', extension: 'xlsx',
      createContents: async () => {
        const workbook = createControlWorkbook({ rows, normalized, exportedAt, report: this.report });
        return Buffer.from(await workbook.xlsx.writeBuffer());
      },
      getDatabasePaths: () => [snapshotDatabasePath, this.database.filePath],
    });
    return { ...result, count: rows.length };
  }
}
