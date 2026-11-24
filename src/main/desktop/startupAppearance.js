import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startupAppearance } from '../../shared/startupAppearance.js';
import { DATABASE_CONFIG } from '../database/databaseConfig.js';

const FILENAME = 'startup-appearance.ini';

export function readCachedAppearance(userData) {
  try {
    const ini = readFileSync(path.join(userData, FILENAME), 'utf8');
    const section = /^\[Appearance\][^\S\r\n]*\r?\n([^[]*)/m.exec(ini)?.[1] ?? '';
    const theme = /^theme=([a-z-]+)\r?$/m.exec(section)?.[1];
    const appearanceStyle = /^style=([a-z-]+)\r?$/m.exec(section)?.[1];
    const result = startupAppearance({ theme, appearanceStyle });
    if (result.theme === theme && result.appearanceStyle === appearanceStyle) return result;
  } catch { /* An unavailable or incomplete cache can be rebuilt from the database. */ }
  return null;
}

export function saveStartupAppearance(userData, appearance) {
  const { theme, appearanceStyle } = startupAppearance(appearance);
  const saved = readCachedAppearance(userData);
  if (saved?.theme === theme && saved.appearanceStyle === appearanceStyle) return;
  const filename = path.join(userData, FILENAME);
  const temporary = `${filename}.${randomUUID()}.tmp`;
  mkdirSync(userData, { recursive: true });
  try {
    writeFileSync(temporary, `[Appearance]\r\ntheme=${theme}\r\nstyle=${appearanceStyle}\r\n`,
      { encoding: 'ascii', mode: DATABASE_CONFIG.CONFIG_FILE_MODE, flag: 'wx' });
    renameSync(temporary, filename);
  } finally { rmSync(temporary, { force: true }); }
}

export function readDatabaseAppearance(connection) {
  const rows = connection.prepare("SELECT key, value FROM main.app_settings WHERE key IN ('theme','appearanceStyle')").all();
  return startupAppearance(Object.fromEntries(rows.map(({ key, value }) => [key, value])));
}

export function isStartupDatabasePath(filePath, userData, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  if (typeof filePath !== 'string' || !paths.isAbsolute(filePath) || /^[\\/]{2}/.test(filePath)) return false;
  // A drive letter can point to a disconnected share. Cross-volume profiles
  // get their exact colors immediately after normal database restoration.
  return platform !== 'win32' || paths.parse(filePath).root.toLowerCase() === paths.parse(userData).root.toLowerCase();
}

export async function readWindowAppearance(userData) {
  const saved = readCachedAppearance(userData);
  if (saved) return saved;
  // On first run after an upgrade, sample only a checkpointed local Work Board
  // database. Never create its journal, acquire a write lock or run migrations.
  try {
    const location = path.join(userData, DATABASE_CONFIG.LOCATION_FILE);
    const filePath = existsSync(location) ? JSON.parse(readFileSync(location, 'utf8')).filePath
      : path.join(userData, DATABASE_CONFIG.LEGACY_DIRECTORY, DATABASE_CONFIG.LEGACY_FILENAME);
    if (isStartupDatabasePath(filePath, userData)
      && existsSync(filePath) && !existsSync(`${filePath}-wal`) && !existsSync(`${filePath}-journal`)) {
      const { openImmutableDatabase } = await import('../database/sqlite.js');
      const connection = openImmutableDatabase(filePath);
      if (connection) {
        try {
          if (connection.prepare('PRAGMA application_id').get().application_id === DATABASE_CONFIG.APPLICATION_ID
            && connection.prepare("SELECT type FROM main.sqlite_schema WHERE name='app_settings'").get()?.type === 'table') {
            return readDatabaseAppearance(connection);
          }
        } finally { connection.close(); }
      }
    }
  } catch { /* Normal service initialization handles recovery and refreshes the appearance. */ }
  return startupAppearance();
}
