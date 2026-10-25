import { DEFAULT_SETTINGS, validateTheme } from '../../shared/constants/settings.js';

export class SettingsRepository {
  constructor(database) { this.database = database; }

  get() {
    const row = this.database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get('theme');
    return { theme: row ? validateTheme(row.value) : DEFAULT_SETTINGS.theme };
  }

  setTheme(theme) {
    validateTheme(theme);
    this.database.connection.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('theme', theme);
    return this.get();
  }
}
