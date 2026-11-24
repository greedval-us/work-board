<script setup>
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { LockKeyhole } from 'lucide-vue-next';
import { APP_LOCK_PASSWORD_MAX_LENGTH, APP_LOCK_TIMEOUT_MINUTES, DEFAULT_APP_LOCK_TIMEOUT_MINUTES } from '../../../shared/appLock.js';
import { useAppLockStore } from '../../app/appLockStore.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';

const appLock = useAppLockStore();
const mode = shallowRef('');
const timeoutMinutes = shallowRef(DEFAULT_APP_LOCK_TIMEOUT_MINUTES);
const currentPassword = shallowRef('');
const password = shallowRef('');
const confirmation = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);
const form = useTemplateRef('form');
const editButton = useTemplateRef('editButton');
const removeButton = useTemplateRef('removeButton');
const timeoutLabels = { 5: '5 минут', 60: '1 час', 180: '3 часа' };

function showForm(nextMode) {
  timeoutMinutes.value = appLock.status.timeoutMinutes;
  mode.value = nextMode;
  nextTick(() => form.value?.querySelector('input')?.focus());
}

function resetForm(restoreFocus = false) {
  const removing = mode.value === 'remove';
  mode.value = '';
  currentPassword.value = '';
  password.value = '';
  confirmation.value = '';
  error.value = '';
  if (restoreFocus) nextTick(() => (removing && removeButton.value || editButton.value)?.focus());
}

async function saveSettings() {
  if (saving.value || !mode.value || appLock.blocked) return;
  error.value = '';
  if (mode.value !== 'remove' && password.value && password.value !== confirmation.value) {
    error.value = 'Пароли не совпадают.';
    return;
  }
  const payload = { timeoutMinutes: timeoutMinutes.value };
  if (appLock.status.enabled) payload.currentPassword = currentPassword.value;
  if (mode.value === 'remove') payload.password = '';
  else if (password.value) payload.password = password.value;
  saving.value = true;
  try { await appLock.configure(payload); resetForm(true); }
  catch (cause) {
    if (!appLock.blocked) error.value = errorMessage(cause, 'Не удалось сохранить настройки блокировки.');
  } finally { saving.value = false; }
}

watch(() => appLock.blocked, blocked => { if (blocked) resetForm(); }, { flush: 'sync' });
</script>

<template>
  <section class="settings-section" aria-labelledby="app-lock-settings-title">
    <div class="section-heading">
      <span class="settings-glyph"><LockKeyhole :size="17" aria-hidden="true" /></span>
      <h2 id="app-lock-settings-title">Блокировка приложения</h2>
    </div>
    <template v-if="!mode">
      <dl class="details-list">
        <div><dt>Пароль</dt><dd>{{ appLock.status?.enabled ? 'Установлен' : 'Не установлен' }}</dd></div>
        <div v-if="appLock.status?.enabled"><dt>Блокировать через</dt><dd>{{ timeoutLabels[appLock.status.timeoutMinutes] }}</dd></div>
      </dl>
      <div class="app-lock-settings-actions">
        <button ref="editButton" type="button" class="app-lock-button" @click="showForm('edit')">
          {{ appLock.status?.enabled ? 'Изменить настройки' : 'Установить пароль' }}
        </button>
        <button v-if="appLock.status?.enabled" ref="removeButton" type="button" class="app-lock-button" @click="showForm('remove')">Отключить пароль</button>
      </div>
    </template>
    <form v-else ref="form" @submit.prevent="saveSettings">
      <fieldset class="app-lock-settings-fields" :disabled="saving">
        <legend class="sr-only">{{ mode === 'remove' ? 'Отключение пароля' : 'Настройки блокировки' }}</legend>
        <label v-if="appLock.status?.enabled" class="app-lock-field">
          <span>Текущий пароль</span>
          <input v-model="currentPassword" type="password" name="current-password" autocomplete="current-password"
            required :maxlength="APP_LOCK_PASSWORD_MAX_LENGTH" />
        </label>
        <template v-if="mode !== 'remove'">
          <label class="app-lock-field">
            <span>{{ appLock.status?.enabled ? 'Новый пароль (необязательно)' : 'Пароль' }}</span>
            <input v-model="password" type="password" name="new-password" autocomplete="new-password"
              :required="!appLock.status?.enabled" :maxlength="APP_LOCK_PASSWORD_MAX_LENGTH" />
          </label>
          <label v-if="password || !appLock.status?.enabled" class="app-lock-field">
            <span>Повторите пароль</span>
            <input v-model="confirmation" type="password" name="confirm-password" autocomplete="new-password"
              required :maxlength="APP_LOCK_PASSWORD_MAX_LENGTH" />
          </label>
          <label class="app-lock-field">
            <span>Блокировать после бездействия</span>
            <select v-model="timeoutMinutes" name="app-lock-timeout">
              <option v-for="time in APP_LOCK_TIMEOUT_MINUTES" :key="time" :value="time">{{ timeoutLabels[time] }}</option>
            </select>
          </label>
        </template>
        <p v-if="error" class="app-lock-error" role="alert">{{ error }}</p>
        <div class="app-lock-settings-actions">
          <button type="submit" class="app-lock-button app-lock-primary">
            {{ saving ? 'Сохранение…' : mode === 'remove' ? 'Отключить пароль' : 'Сохранить' }}
          </button>
          <button type="button" class="app-lock-button" @click="resetForm(true)">Отмена</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.app-lock-settings-fields { display: grid; gap: 9px; min-width: 0; margin: 0; padding: 0; border: 0; }
.app-lock-settings-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.app-lock-settings-fields .app-lock-settings-actions { margin-top: 0; }
</style>
