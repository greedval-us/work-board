import { createRequire } from 'node:module';
import { appPath } from '../utils/appPaths.js';

const runtimeRequire = createRequire(appPath('package.json'));
const usesBuiltinSqlite = Number(process.versions.node.split('.')[0]) >= 22;
const Backend = usesBuiltinSqlite
  ? runtimeRequire('node:sqlite').DatabaseSync
  : runtimeRequire('better-sqlite3');

// Keep the existing synchronous database contract on Electron 22 / Node 16.
export const DatabaseSync = usesBuiltinSqlite ? Backend : class DatabaseSync extends Backend {
  constructor(filename, { readOnly = false, ...options } = {}) {
    super(filename, { ...options, readonly: readOnly });
  }
};
