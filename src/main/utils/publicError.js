import { ERROR_CODES, ValidationError, defaultErrorMessage, isErrorCode } from '../../shared/errors.js';
import { AppError } from './AppError.js';
import { SQLITE_PRIMARY_CODE_MASK, SQLITE_RESULT } from '../database/sqliteErrors.js';

const FAILURE_RULES = Object.freeze([
  { codes: ['SQLITE_BUSY', 'SQLITE_LOCKED'], sqlite: [SQLITE_RESULT.BUSY, SQLITE_RESULT.LOCKED], publicCode: ERROR_CODES.DATABASE_LOCKED },
  { codes: ['EACCES', 'EPERM', 'SQLITE_PERM', 'SQLITE_READONLY', 'SQLITE_AUTH'], sqlite: [SQLITE_RESULT.PERMISSION, SQLITE_RESULT.READ_ONLY, SQLITE_RESULT.AUTHORIZATION], publicCode: ERROR_CODES.PERMISSION_DENIED },
  { codes: ['ENOENT', 'SQLITE_CANTOPEN'], sqlite: [SQLITE_RESULT.CANNOT_OPEN], publicCode: ERROR_CODES.DATABASE_UNAVAILABLE },
]);

export function publicError(error) {
  if (error instanceof AppError && isErrorCode(error.code)) {
    return { code: error.code, message: error.publicMessage };
  }
  if (error instanceof ValidationError) {
    return { code: ERROR_CODES.VALIDATION, message: error.publicMessage };
  }

  // node:sqlite uses ERR_SQLITE_ERROR and a numeric (possibly extended) errcode.
  const sqliteCode = Number.isInteger(error?.errcode) ? error.errcode & SQLITE_PRIMARY_CODE_MASK : null;
  const matched = FAILURE_RULES.find(rule => rule.codes.includes(error?.code) || rule.sqlite.includes(sqliteCode));
  const code = matched?.publicCode ?? ERROR_CODES.UNEXPECTED;
  return { code, message: defaultErrorMessage(code) };
}
