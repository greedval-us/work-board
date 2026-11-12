import { controlCardFields, executorContactFor, normalizeControlCardFields } from '../../shared/controlCard.js';
import { validateId } from '../../shared/validation.js';
import { writeAtomicFile } from '../files/atomicFile.js';
import { AppError } from '../utils/AppError.js';
import { createControlCardDocument } from './ControlCardDocument.js';

export class ControlCardExportService {
  constructor({ database, instructions, settings, dialog, getWindow }) {
    Object.assign(this, { database, instructions, settings, dialog, getWindow });
  }

  async export({ id, generation, fields }) {
    this.database.assertGeneration(generation);
    const record = this.instructions.get(validateId(id));
    if (!record) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    const { executorContacts } = this.settings.get();
    const defaults = { ...controlCardFields(record), ...executorContactFor(fields?.executor ?? record.executor, executorContacts) };
    const values = normalizeControlCardFields(fields, defaults);
    const marks = record.controlSchedule?.marks ?? [];
    const result = await this.dialog.showSaveDialog(this.getWindow(), {
      title: 'Сохранить контрольную карточку Ф‑21', defaultPath: `Ф-21 Указание ${id}.docx`,
      filters: [{ name: 'Документ Word', extensions: ['docx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    this.database.assertGeneration(generation);
    if (result.canceled || !result.filePath) return { cancelled: true };
    const selected = result.filePath.toLowerCase().endsWith('.docx') ? result.filePath : `${result.filePath}.docx`;
    const contents = await createControlCardDocument({ fields: values, marks, recordId: record.id });
    const filePath = await writeAtomicFile(selected, contents, {
      getDatabasePaths: () => [this.database.filePath],
      assertCurrent: () => this.database.assertGeneration(generation),
    });
    return { cancelled: false, filePath };
  }
}
