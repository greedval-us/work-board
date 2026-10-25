import { IPC_CHANNELS } from '../../shared/constants/ipcChannels.js';
import { DesktopError, ERROR_CODES, isErrorCode } from '../../shared/errors.js';

export function getDesktopApi() {
  const api = globalThis.window?.desktopAPI;
  if (!api) throw new DesktopError(ERROR_CODES.IPC_UNAVAILABLE);
  return api;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function decodeResult(result) {
  if (record(result) && Object.keys(result).length === 2 && Object.hasOwn(result, 'ok')) {
    if (result.ok === true && Object.hasOwn(result, 'value')) return result.value;
    if (result.ok === false && Object.hasOwn(result, 'error')) {
      const error = result.error;
      if (record(error) && Object.keys(error).length === 2
        && Object.hasOwn(error, 'code') && isErrorCode(error.code)
        && Object.hasOwn(error, 'message') && typeof error.message === 'string'
        && error.message.trim() && error.message.length <= 500) {
        throw new DesktopError(error.code, error.message);
      }
    }
  }
  throw new DesktopError(ERROR_CODES.IPC_PROTOCOL);
}

// This is the renderer's single transport boundary. Services expose values/errors.
export async function requestDesktop(namespace, method, ...args) {
  const api = getDesktopApi();
  if (!Object.hasOwn(IPC_CHANNELS, namespace) || !Object.hasOwn(IPC_CHANNELS[namespace], method)
    || typeof api[namespace]?.[method] !== 'function') {
    throw new DesktopError(ERROR_CODES.IPC_UNAVAILABLE);
  }
  let result;
  try {
    result = await api[namespace][method](...args);
  } catch {
    // Electron transport errors may contain paths, SQL or internal channel names.
    throw new DesktopError(ERROR_CODES.IPC_UNAVAILABLE);
  }
  return decodeResult(result);
}
