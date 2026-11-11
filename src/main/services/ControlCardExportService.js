import { randomUUID } from 'node:crypto';
import { realpathSync, renameSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { controlCardFields, normalizeControlCardFields } from '../../shared/controlCard.js';
import { ValidationError } from '../../shared/errors.js';
import { validateId } from '../../shared/validation.js';
import { AppError } from '../utils/AppError.js';
import { createControlCardDocument } from './ControlCardDocument.js';

export class ControlCardExportService {
  constructor({ database, instructions, dialog, getWindow }) { Object.assign(this, { database, instructions, dialog, getWindow }); }

  async export({ id, generation, fields }) {
    this.database.assertGeneration(generation);
    const record = this.instructions.get(validateId(id));
    if (!record) throw new AppError('Указание не найдено.', 'NOT_FOUND');
    const values = normalizeControlCardFields(fields, controlCardFields(record));
    const marks = record.controlSchedule?.marks ?? [];
    const result = await this.dialog.showSaveDialog(this.getWindow(), {
      title: 'Сохранить контрольную карточку Ф‑21', defaultPath: `Ф-21 Указание ${id}.docx`,
      filters: [{ name: 'Документ Word', extensions: ['docx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    this.database.assertGeneration(generation);
    if (result.canceled || !result.filePath) return { cancelled: true };
    const selected = result.filePath.toLowerCase().endsWith('.docx') ? result.filePath : `${result.filePath}.docx`;
    const directory = realpathSync(path.dirname(selected));
    const filePath = path.join(directory, path.basename(selected));
    if (filePath.toLowerCase() === realpathSync(this.database.filePath).toLowerCase()) {
      throw new ValidationError('Выберите для отчёта имя, отличное от имени рабочей базы.');
    }

    const contents = await createControlCardDocument({ fields: values, marks });
    const temporary = path.join(directory, `.${randomUUID()}.docx.tmp`);
    try {
      await writeFile(temporary, contents, { flag: 'wx' });
      this.database.assertGeneration(generation);
      renameSync(temporary, filePath);
    } finally { await rm(temporary, { force: true }); }
    return { cancelled: false, filePath };
  }
}
