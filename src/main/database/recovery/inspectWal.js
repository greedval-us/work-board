import { closeSync, constants, copyFileSync, existsSync, mkdtempSync, openSync, readSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync, openImmutableDatabase } from '../sqlite.js';

// Reads of a WAL database can create or update its WAL index, even with a
// read-only connection. Inspect its committed state without touching that index.
export function usesWal(filePath) {
  const fd = openSync(filePath, 'r');
  try {
    const format = Buffer.alloc(2);
    // SQLite file header bytes 18 and 19 are the write/read journal versions.
    return readSync(fd, format, 0, 2, 18) === 2 && (format[0] === 2 || format[1] === 2);
  } finally { closeSync(fd); }
}

export function inspectWal(filePath, inspect) {
  const wal = `${filePath}-wal`;
  if (!existsSync(wal)) {
    const immutable = openImmutableDatabase(filePath);
    if (immutable) {
      try { return inspect(immutable); }
      finally { immutable.close(); }
    }
  }

  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-inspect-'));
  const copy = path.join(directory, 'candidate.sqlite');
  try {
    copyFileSync(filePath, copy, constants.COPYFILE_FICLONE);
    // Copy the log as well. Committed schema and rows can still be absent from
    // the main file. SQLite rebuilds the private index as needed.
    try { copyFileSync(wal, `${copy}-wal`, constants.COPYFILE_FICLONE); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const snapshot = new DatabaseSync(copy);
    try { return inspect(snapshot); }
    finally { snapshot.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
