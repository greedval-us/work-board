<script setup>
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { Bell, LockKeyhole } from 'lucide-vue-next';
import { APP_LOCK_PASSWORD_MAX_LENGTH } from '../../shared/appLock.js';
import { NOTIFICATION_CHECK_INTERVAL_MS } from '../../shared/constants/notifications.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import AppIcon from '../ui/AppIcon.vue';
import { useAppLockStore } from './appLockStore.js';

const appLock = useAppLockStore();
const dialog = useTemplateRef('dialog');
const passwordInput = useTemplateRef('passwordInput');
const password = shallowRef('');
const error = shallowRef('');
const submitting = shallowRef(false);
const pendingNotifications = shallowRef(false);
let notificationTimer;
let checkingNotifications = false;
let disposed = false;

async function checkNotifications() {
  if (!appLock.status?.locked || checkingNotifications || document.visibilityState === 'hidden') return;
  checkingNotifications = true;
  try {
    const pending = await appLock.hasPendingNotifications();
    if (!disposed && appLock.status?.locked) pendingNotifications.value = pending === true;
  } catch {
    // A failed check leaves the existing indication in place until the next check.
  } finally { checkingNotifications = false; }
}

async function unlock() {
  if (submitting.value || !password.value) return;
  submitting.value = true;
  error.value = '';
  try { await appLock.unlock(password.value); }
  catch (cause) { error.value = errorMessage(cause, 'Не удалось разблокировать приложение.'); }
  finally {
    password.value = '';
    submitting.value = false;
    if (error.value) nextTick(() => passwordInput.value?.focus());
  }
}

watch(() => appLock.status?.locked, locked => {
  if (!locked) return;
  void checkNotifications();
  passwordInput.value?.focus();
}, { flush: 'post' });

onMounted(() => {
  dialog.value.showModal();
  void checkNotifications();
  notificationTimer = setInterval(checkNotifications, NOTIFICATION_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', checkNotifications);
  window.addEventListener('focus', checkNotifications);
});

onBeforeUnmount(() => {
  disposed = true;
  clearInterval(notificationTimer);
  document.removeEventListener('visibilitychange', checkNotifications);
  window.removeEventListener('focus', checkNotifications);
  dialog.value?.close();
});
</script>

<template>
  <dialog ref="dialog" class="app-lock-screen" aria-labelledby="app-lock-title" @cancel.prevent>
    <div class="app-lock-card">
      <div class="app-lock-brand"><AppIcon :size="30" /><span>Work Board</span></div>
      <template v-if="appLock.status?.locked">
        <h1 id="app-lock-title"><LockKeyhole :size="20" aria-hidden="true" /> Приложение заблокировано</h1>
        <form class="app-lock-unlock-form" @submit.prevent="unlock">
          <label class="app-lock-field">
            <span>Пароль</span>
            <input ref="passwordInput" v-model="password" type="password" name="unlock-password" autocomplete="current-password"
              required autofocus :maxlength="APP_LOCK_PASSWORD_MAX_LENGTH" :disabled="submitting"
              :aria-invalid="Boolean(error) || undefined" :aria-describedby="error ? 'app-unlock-error' : undefined" />
          </label>
          <p v-if="error" id="app-unlock-error" class="app-lock-error" role="alert">{{ error }}</p>
          <button type="submit" class="app-lock-button app-lock-primary" :disabled="submitting">
            {{ submitting ? 'Разблокировка…' : 'Разблокировать' }}
          </button>
        </form>
        <div class="app-lock-notification" role="status">
          <template v-if="pendingNotifications"><Bell :size="16" aria-hidden="true" /> Новое уведомление</template>
        </div>
      </template>
      <template v-else>
        <h1 id="app-lock-title">Проверка блокировки</h1>
        <template v-if="appLock.error">
          <p class="app-lock-error" role="alert">{{ appLock.error }}</p>
          <button type="button" class="app-lock-button" @click="appLock.initialize">Повторить</button>
        </template>
        <p v-else class="app-lock-help" role="status">Загрузка…</p>
      </template>
    </div>
  </dialog>
</template>

<style>
[data-app-lock-blocked] :is(.app-shell, .registry-filter-panel, dialog:not(.app-lock-screen)),
[data-app-lock-blocked] dialog:not(.app-lock-screen)::backdrop { visibility: hidden !important; }

.app-lock-screen {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 20px;
  border: 0;
  background: var(--canvas);
  color: var(--text);
  overflow: auto;
}
.app-lock-screen[open] { display: grid; }
.app-lock-screen::backdrop { background: var(--canvas); }
.app-lock-card {
  display: grid;
  gap: 16px;
  width: min(100%, 380px);
  margin: auto;
  padding: clamp(18px, 4vw, 28px);
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  box-shadow: var(--surface-shadow);
}
.app-lock-brand { display: flex; align-items: center; gap: 8px; color: var(--muted); font-weight: 620; }
.app-lock-card h1 { display: flex; align-items: center; gap: 8px; font-size: calc(18px + var(--app-font-offset)); font-weight: 680; line-height: 1.25; letter-spacing: -.025em; }
.app-lock-card h1 svg { color: var(--accent); }
.app-lock-unlock-form { display: grid; gap: 10px; }
.app-lock-field { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: calc(12px + var(--app-font-offset)); }
.app-lock-field :is(input, select) { width: 100%; min-width: 0; min-height: 34px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--grouped); color: var(--text); }
.app-lock-button { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 5px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--grouped); color: var(--text); font-size: calc(12px + var(--app-font-offset)); font-weight: 600; }
.app-lock-button:enabled:hover { background: var(--raised); }
.app-lock-button.app-lock-primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
.app-lock-button.app-lock-primary:enabled:hover { opacity: .9; }
.app-lock-error { color: var(--error); font-size: calc(12px + var(--app-font-offset)); }
.app-lock-help { color: var(--muted); font-size: calc(12px + var(--app-font-offset)); }
.app-lock-notification { display: flex; align-items: center; gap: 6px; color: var(--accent); font-size: calc(12px + var(--app-font-offset)); }
.app-lock-notification:empty { position: absolute; }
</style>
