import { controlCardFields, executorContactFor, normalizeControlCardFields } from '../../shared/controlCard.js';
import { validateId } from '../../shared/validation.js';
import { saveExportFile } from '../exports/saveExportFile.js';
import { AppError } from '../errors/AppError.js';
import { createControlCardDocument } from '../exports/word/ControlCardDocument.js';

export class ControlCardExportService {
  constructor({ database, instructions, settings, ...fileOptions }) {
    Object.assign(this, { database, instructions, settings, fileOptions });
  }

  async export({ id, generation, fields }) {
    this.database.assertGeneration(generation);
    const record = this.instructions.get(validateId(id));
    if (!record) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    const { executorContacts, office = '' } = this.settings.get();
    const defaults = {
      ...controlCardFields(record),
      ...executorContactFor(fields?.executor ?? record.executor, executorContacts),
      office,
    };
    const values = normalizeControlCardFields(fields, defaults);
    const marks = record.controlSchedule?.marks ?? [];
    return saveExportFile(this.fileOptions, {
      title: 'Сохранить контрольную карточку Ф‑21', defaultName: `Ф-21 Указание ${id}`,
      fileType: 'Документ Word', extension: 'docx',
      createContents: () => createControlCardDocument({ fields: values, marks, recordId: record.id }),
      getDatabasePaths: () => [this.database.filePath],
      assertGeneration: () => this.database.assertGeneration(generation),
    });
  }
}
