import { ERROR_CODES, ValidationError, defaultErrorMessage, isErrorCode } from '../../shared/errors.js';
import { AppError } from './AppError.js';

export function publicError(error) {
  if (error instanceof AppError && isErrorCode(error.code)) {
    return { code: error.code, message: error.publicMessage };
  }
  if (error instanceof ValidationError) {
    return { code: ERROR_CODES.VALIDATION, message: error.publicMessage };
  }

  // node:sqlite uses ERR_SQLITE_ERROR and a numeric (possibly extended) errcode.
  const sqliteCode = Number.isInteger(error?.errcode) ? error.errcode & 0xff : null;
  let code = ERROR_CODES.UNEXPECTED;
  if (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error?.code) || [5, 6].includes(sqliteCode)) {
    code = ERROR_CODES.DATABASE_LOCKED;
  } else if (['EACCES', 'EPERM', 'SQLITE_PERM', 'SQLITE_READONLY', 'SQLITE_AUTH'].includes(error?.code) || [3, 8, 23].includes(sqliteCode)) {
    code = ERROR_CODES.PERMISSION_DENIED;
  } else if (['ENOENT', 'SQLITE_CANTOPEN'].includes(error?.code) || sqliteCode === 14) {
    code = ERROR_CODES.DATABASE_UNAVAILABLE;
  }
  return { code, message: defaultErrorMessage(code) };
}
