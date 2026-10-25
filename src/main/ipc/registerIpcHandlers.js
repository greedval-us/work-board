import { AppError } from '../utils/AppError.js';
import { publicError } from '../utils/publicError.js';

export function registerIpcHandlers({ ipcMain, requests, isTrusted, logger }) {
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
          return { ok: true, value: await handler(...args) };
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
