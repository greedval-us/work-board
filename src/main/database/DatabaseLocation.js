import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DATABASE_CONFIG } from './databaseConfig.js';

export class DatabaseLocation {
  constructor({ userData, database }) {
    this.userData = userData;
    this.database = database;
    this.configPath = path.join(userData, DATABASE_CONFIG.LOCATION_FILE);
  }

  save(filePath) {
    mkdirSync(this.userData, { recursive: true });
    const temporary = `${this.configPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ filePath }, null, 2), { encoding: 'utf8', mode: DATABASE_CONFIG.CONFIG_FILE_MODE });
      renameSync(temporary, this.configPath);
    } finally { if (existsSync(temporary)) rmSync(temporary); }
  }

  restore() {
    try {
      if (existsSync(this.configPath)) {
        const value = JSON.parse(readFileSync(this.configPath, 'utf8'));
        this.database.replace({ filePath: value.filePath });
      } else {
        const legacy = path.join(this.userData, DATABASE_CONFIG.LEGACY_DIRECTORY, DATABASE_CONFIG.LEGACY_FILENAME);
        if (existsSync(legacy)) this.database.replace({ filePath: legacy, persist: (filePath) => this.save(filePath) });
        else this.database.message = 'Создайте новую базу или откройте существующую в настройках.';
      }
    } catch (error) {
      this.database.message = error.publicMessage ?? 'Не удалось восстановить выбранную базу. Выберите файл в настройках.';
    }
    return this.database.getStatus();
  }
}
