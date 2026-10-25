import path from 'node:path';
import { AppError } from '../utils/AppError.js';

export class DatabaseSelectionService {
  #selecting = false;
  constructor({ database, location, dialog, getWindow }) { Object.assign(this, { database, location, dialog, getWindow }); }
  create() { return this.select('create'); }
  open() { return this.select('open'); }

  async select(mode) {
    if (this.#selecting) throw new AppError('Выбор базы уже открыт. Завершите его перед повторным действием.');
    this.#selecting = true;
    try {
      const options = { title: mode === 'create' ? 'Создать базу Work Board' : 'Открыть базу Work Board',
        filters: [{ name: 'База данных SQLite', extensions: ['sqlite', 'sqlite3', 'db'] }] };
      let filePath;
      if (mode === 'create') {
        const result = await this.dialog.showSaveDialog(this.getWindow(), { ...options, defaultPath: 'work-board.sqlite', properties: ['createDirectory'] });
        if (result.canceled || !result.filePath) return { cancelled: true, status: this.database.getStatus() };
        filePath = path.extname(result.filePath) ? result.filePath : `${result.filePath}.sqlite`;
      } else {
        const result = await this.dialog.showOpenDialog(this.getWindow(), { ...options, properties: ['openFile'] });
        if (result.canceled || !result.filePaths?.length) return { cancelled: true, status: this.database.getStatus() };
        filePath = result.filePaths[0];
      }
      const status = this.database.replace({ filePath, create: mode === 'create', persist: (value) => this.location.save(value) });
      return { cancelled: false, status };
    } finally { this.#selecting = false; }
  }
}
