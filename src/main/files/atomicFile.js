import { randomUUID } from 'node:crypto';
import { realpathSync, renameSync } from 'node:fs';
import filesystem from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '../../shared/errors.js';
import { CleanupError } from '../errors/cleanup.js';

const DATABASE_FILE_SUFFIXES = Object.freeze(['', '-wal', '-shm']);
const LEGACY_ATTACHMENT_ROOT_SUFFIX = '.files';

function canonicalPath(filePath) {
  const absolute = path.resolve(filePath);
  try { return realpathSync(absolute); }
  catch (error) {
    if (error.code !== 'ENOENT' || path.dirname(absolute) === absolute) throw error;
    return path.join(canonicalPath(path.dirname(absolute)), path.basename(absolute));
  }
}

function outputPath(filePath, databasePaths) {
  const destination = path.join(canonicalPath(path.dirname(filePath)), path.basename(filePath));
  const compared = canonicalPath(destination).toLowerCase();
  // SQLite may resolve the database filename before deriving its WAL/SHM paths.
  const protectedPaths = new Set(databasePaths.filter(Boolean)
    .flatMap(databasePath => [databasePath, canonicalPath(databasePath)]));
  for (const databasePath of protectedPaths) {
    const files = DATABASE_FILE_SUFFIXES.map(suffix => canonicalPath(`${databasePath}${suffix}`).toLowerCase());
    const storage = canonicalPath(`${databasePath}${LEGACY_ATTACHMENT_ROOT_SUFFIX}`).toLowerCase();
    if (files.includes(compared) || compared === storage || compared.startsWith(storage + path.sep)) {
      throw new ValidationError('Выберите место вне рабочей базы и папки вложений.');
    }
  }
  return destination;
}

export async function writeAtomicFile(filePath, contents, { getDatabasePaths = () => [], assertCurrent = () => {}, mode } = {}) {
  const destination = outputPath(filePath, getDatabasePaths());
  const temporary = path.join(path.dirname(destination), `.${randomUUID()}.tmp`);
  let handle;
  let owned = false;
  try {
    // Reserve the path first: failed exclusive creation must never clean someone else's file.
    handle = await filesystem.open(temporary, 'wx', mode);
    owned = true;
    await handle.close();
    handle = null;
    await filesystem.writeFile(temporary, contents);
    outputPath(destination, getDatabasePaths());
    assertCurrent();
    renameSync(temporary, destination);
    return destination;
  } catch (error) {
    if (!owned) throw error;
    const cleanupErrors = [];
    if (handle) {
      try { await handle.close(); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    try { await filesystem.rm(temporary, { force: true }); }
    catch (cleanupError) { cleanupErrors.push(cleanupError); }
    if (cleanupErrors.length) throw new CleanupError(error, cleanupErrors);
    throw error;
  }
}
