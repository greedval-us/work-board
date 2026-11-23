export const ERROR_CODES = Object.freeze({
  APPLICATION: 'APPLICATION',
  VALIDATION: 'VALIDATION',
  DATABASE_REQUIRED: 'DATABASE_REQUIRED',
  DATABASE_CHANGED: 'DATABASE_CHANGED',
  DATABASE_MISSING: 'DATABASE_MISSING',
  DATABASE_NEWER: 'DATABASE_NEWER',
  DATABASE_FOREIGN: 'DATABASE_FOREIGN',
  DATABASE_INVALID: 'DATABASE_INVALID',
  DATABASE_EXISTS: 'DATABASE_EXISTS',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  DATABASE_LOCKED: 'DATABASE_LOCKED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  UNEXPECTED: 'UNEXPECTED',
  IPC_UNAVAILABLE: 'IPC_UNAVAILABLE',
  IPC_PROTOCOL: 'IPC_PROTOCOL',
});

const messages = Object.freeze({
  APPLICATION: 'Не удалось выполнить действие.',
  VALIDATION: 'Проверьте введённые данные.',
  DATABASE_REQUIRED: 'База данных не открыта. Создайте или выберите базу в настройках.',
  DATABASE_CHANGED: 'Активная база изменилась. Обновите данные и повторите действие.',
  DATABASE_MISSING: 'Файл базы не найден. Выберите другую базу в настройках.',
  DATABASE_NEWER: 'Версия базы данных новее версии приложения.',
  DATABASE_FOREIGN: 'Выбранный файл не является базой Work Board.',
  DATABASE_INVALID: 'Не удалось открыть выбранную базу Work Board.',
  DATABASE_EXISTS: 'Этот файл уже существует. Выберите другое имя или откройте базу.',
  DATABASE_UNAVAILABLE: 'База данных недоступна. Проверьте её расположение и повторите действие.',
  DATABASE_LOCKED: 'Файл базы занят. Завершите работу с ним в другом приложении и повторите действие.',
  PERMISSION_DENIED: 'Нет доступа к файлу. Проверьте разрешения и повторите действие.',
  NOT_FOUND: 'Запись не найдена. Обновите данные.',
  UNEXPECTED: 'Не удалось выполнить операцию. Повторите попытку.',
  IPC_UNAVAILABLE: 'Связь с приложением недоступна. Перезапустите Work Board через Electron.',
  IPC_PROTOCOL: 'Не удалось получить ответ приложения. Повторите действие.',
});

export function isErrorCode(code) {
  return typeof code === 'string' && Object.hasOwn(ERROR_CODES, code);
}

export function defaultErrorMessage(code) {
  return isErrorCode(code) ? messages[code] : messages.UNEXPECTED;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = ERROR_CODES.VALIDATION;
    this.publicMessage = message;
  }
}

// Only construct this with a public message or a validated IPC failure.
export class DesktopError extends Error {
  constructor(code, message = defaultErrorMessage(code)) {
    const known = isErrorCode(code);
    const publicMessage = known && typeof message === 'string' && message.trim()
      ? message : defaultErrorMessage(known ? code : ERROR_CODES.UNEXPECTED);
    super(publicMessage);
    this.name = 'DesktopError';
    this.code = known ? code : ERROR_CODES.UNEXPECTED;
    this.publicMessage = publicMessage;
  }
}
