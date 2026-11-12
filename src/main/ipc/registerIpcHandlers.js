import { AppError } from '../utils/AppError.js';
import { publicError } from '../utils/publicError.js';

export function registerIpcHandlers({ ipcMain, requests, isTrusted, logger, onSuccess }) {
  const registered = [];
  const unregister = () => {
    for (const channel of registered.splice(0)) ipcMain.removeHandler(channel);
  };
  try {
    for (const [channel, handler] of Object.entries(requests)) {
      ipcMain.handle(channel, async (event, ...args) => {
        try {
          // Authorization must happen before payload validation or data access.
          if (!isTrusted(event)) throw new AppError('Недопустимый источник запроса.', 'PERMISSION_DENIED');
          const value = await handler(...args);
          // A background observer must never turn a committed write into a failed IPC result.
          try { onSuccess?.(channel); }
          catch (error) { logger.error('IPC completion observer failed', { channel }, error); }
          return { ok: true, value };
        }
        catch (error) {
          const failure = publicError(error);
          logger.error('IPC request failed', { channel, code: failure.code }, error);
          return { ok: false, error: failure };
        }
      });
      registered.push(channel);
    }
  } catch (error) {
    unregister();
    throw error;
  }
  return unregister;
}
