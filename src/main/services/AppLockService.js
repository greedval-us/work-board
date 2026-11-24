import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { APP_LOCK_PASSWORD_MAX_LENGTH, APP_LOCK_TIMEOUT_MINUTES, DEFAULT_APP_LOCK_TIMEOUT_MINUTES } from '../../shared/appLock.js';
import { ERROR_CODES, ValidationError, defaultErrorMessage } from '../../shared/errors.js';
import { AppError } from '../errors/AppError.js';
import { writeAtomicFile } from '../files/atomicFile.js';

const VERSION = 1;
const MINUTE_MS = 60_000;
const FAILED_ATTEMPT_LIMIT = 5;
const RETRY_DELAY_MS = 30_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const deriveKey = promisify(scrypt);
// The configuration version fixes the verifier parameters for stored passwords.
const SCRYPT_OPTIONS = Object.freeze({ N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });

function isHex(value, bytes) {
  return typeof value === 'string' && value.length === bytes * 2 && !/[^a-f0-9]/.test(value);
}

function loadConfiguration(filePath) {
  let content;
  try { content = readFileSync(filePath, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { version: VERSION, timeoutMinutes: DEFAULT_APP_LOCK_TIMEOUT_MINUTES, credential: null };
    throw error;
  }
  let saved;
  try { saved = JSON.parse(content); }
  catch { throw new Error('Не удалось прочитать настройки блокировки приложения.'); }
  if (saved?.version !== VERSION || !APP_LOCK_TIMEOUT_MINUTES.includes(saved.timeoutMinutes)
    || !(saved.credential === null || (isHex(saved.credential?.salt, SALT_BYTES) && isHex(saved.credential?.hash, HASH_BYTES)))) {
    throw new Error('Некорректные настройки блокировки приложения.');
  }
  return saved;
}

function validatePassword(password, message) {
  if (typeof password !== 'string' || password.length > APP_LOCK_PASSWORD_MAX_LENGTH || !password.trim()) {
    throw new ValidationError(message);
  }
}

function hashPassword(password, salt) {
  return deriveKey(Buffer.from(password, 'utf16le'), salt, HASH_BYTES, SCRYPT_OPTIONS);
}

async function createCredential(password) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await hashPassword(password, salt);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export class AppLockService {
  #configuration;
  #locked;
  #lastActivity = 0;
  #failedAttempts = 0;
  #retryAt = 0;
  #verifying = false;

  constructor({ filePath, now = Date.now, onStatusChanged = () => {} }) {
    Object.assign(this, { filePath, now, onStatusChanged });
    this.#configuration = loadConfiguration(filePath);
    this.#locked = this.#configuration.credential !== null;
  }

  #status() {
    return { enabled: this.#configuration.credential !== null, locked: this.#locked, timeoutMinutes: this.#configuration.timeoutMinutes };
  }

  #publishStatus() {
    const status = this.#status();
    this.onStatusChanged(status);
    return status;
  }

  getStatus() {
    if (this.#configuration.credential && !this.#locked
      && this.now() - this.#lastActivity >= this.#configuration.timeoutMinutes * MINUTE_MS) return this.lock();
    return this.#status();
  }

  recordActivity() {
    const status = this.getStatus();
    if (status.enabled && !status.locked) this.#lastActivity = this.now();
    return status;
  }

  lock() {
    if (this.#locked || !this.#configuration.credential) return this.#status();
    this.#locked = true;
    return this.#publishStatus();
  }

  assertUnlocked() {
    if (this.getStatus().locked) {
      throw new AppError(defaultErrorMessage(ERROR_CODES.APPLICATION_LOCKED), ERROR_CODES.APPLICATION_LOCKED);
    }
  }

  async #credentialOperation(operation) {
    if (this.#verifying) throw new AppError('Дождитесь завершения проверки пароля.');
    this.#verifying = true;
    try { return await operation(); }
    finally { this.#verifying = false; }
  }

  #assertCanVerify() {
    const retryAfter = this.#retryAt - this.now();
    if (retryAfter > 0) {
      throw new AppError(`Слишком много попыток. Повторите через ${Math.ceil(retryAfter / 1000)} сек.`, ERROR_CODES.PERMISSION_DENIED);
    }
  }

  async #verifyPassword(password) {
    validatePassword(password, 'Введите пароль.');
    this.#assertCanVerify();
    const { salt, hash } = this.#configuration.credential;
    const actual = await hashPassword(password, Buffer.from(salt, 'hex'));
    if (timingSafeEqual(actual, Buffer.from(hash, 'hex'))) {
      this.#failedAttempts = 0;
      this.#retryAt = 0;
      return;
    }
    this.#failedAttempts++;
    if (this.#failedAttempts >= FAILED_ATTEMPT_LIMIT) {
      this.#failedAttempts = 0;
      this.#retryAt = this.now() + RETRY_DELAY_MS;
      this.#assertCanVerify();
    }
    throw new AppError('Неверный пароль.', ERROR_CODES.PERMISSION_DENIED);
  }

  async configure(payload) {
    const { currentPassword, password, timeoutMinutes } = payload ?? {};
    this.assertUnlocked();
    if (!APP_LOCK_TIMEOUT_MINUTES.includes(timeoutMinutes)) throw new ValidationError('Выберите время автоблокировки из списка.');
    const existing = this.#configuration.credential;
    if (!existing || (password !== undefined && password !== '')) {
      validatePassword(password, `Введите пароль длиной до ${APP_LOCK_PASSWORD_MAX_LENGTH} символов.`);
    }
    return this.#credentialOperation(async () => {
      if (existing) await this.#verifyPassword(currentPassword);
      let credential = existing;
      if (password !== undefined) credential = password === '' ? null : await createCredential(password);
      const configuration = { version: VERSION, timeoutMinutes, credential };
      await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeAtomicFile(this.filePath, JSON.stringify(configuration), { assertCurrent: () => this.assertUnlocked(), mode: 0o600 });
      this.#configuration = configuration;
      this.#lastActivity = this.now();
      return this.#publishStatus();
    });
  }

  async unlock(payload) {
    const status = this.getStatus();
    if (!status.locked) return status;
    return this.#credentialOperation(async () => {
      await this.#verifyPassword(payload?.password);
      this.#lastActivity = this.now();
      this.#locked = false;
      return this.#publishStatus();
    });
  }
}
