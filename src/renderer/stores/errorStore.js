import { defineStore } from 'pinia';
import { shallowRef } from 'vue';
import { errorMessage } from '../infrastructure/errorMessage.js';

// Unexpected errors have one recoverable notification; never retain raw causes
// or unbounded error histories in reactive application state.
export const useErrorStore = defineStore('errors', () => {
  const notification = shallowRef(null);
  let sequence = 0;
  function report(cause) {
    notification.value = {
      id: ++sequence,
      message: errorMessage(cause, 'Не удалось завершить действие. Повторите попытку.'),
    };
  }
  function dismiss() { notification.value = null; }
  return { notification, report, dismiss };
});
