import { pathToFileURL } from 'node:url';
import { requireFromApp } from '../runtime/appPaths.js';

const usesBuiltinSqlite = Number(process.versions.node.split('.')[0]) >= 22;
const Backend = usesBuiltinSqlite
  ? requireFromApp('node:sqlite').DatabaseSync
  : requireFromApp('better-sqlite3');

// Keep the existing synchronous database contract on Electron 22 / Node 16.
export const DatabaseSync = usesBuiltinSqlite ? Backend : class DatabaseSync extends Backend {
  constructor(filename, { readOnly = false, ...options } = {}) {
    super(filename, { ...options, readonly: readOnly });
  }
};

function sqliteFileUri(filePath, option, value) {
  const uri = pathToFileURL(filePath);
  if (uri.host) {
    const uncPath = `//${uri.host}${uri.pathname}`;
    uri.hostname = '';
    uri.pathname = uncPath;
  }
  uri.searchParams.set(option, value);
  return uri.href;
}

export function openExistingDatabase(filePath) {
  if (!usesBuiltinSqlite) return new DatabaseSync(filePath, { fileMustExist: true });
  return new DatabaseSync(sqliteFileUri(filePath, 'mode', 'rw'));
}

// An immutable view is only used for preliminary inspection of checkpointed
// files. The legacy driver is compiled without SQLite URI support.
export function openImmutableDatabase(filePath) {
  if (!usesBuiltinSqlite) return null;
  return new DatabaseSync(sqliteFileUri(filePath, 'immutable', '1'), { readOnly: true });
}
