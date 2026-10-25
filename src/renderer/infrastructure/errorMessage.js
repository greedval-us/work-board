import { DesktopError, ValidationError } from '../../shared/errors.js';

export function errorMessage(error, fallback = 'Не удалось выполнить действие.') {
  return error instanceof DesktopError || error instanceof ValidationError ? error.publicMessage : fallback;
}
