import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { useAppStore } from './appStore.js';

export function useAppearance({
  store = useAppStore(), root = document.documentElement,
  preference = window.matchMedia('(prefers-color-scheme: dark)'),
} = {}) {
  const systemDark = shallowRef(preference.matches);
  const updateSystemTheme = event => { systemDark.value = event.matches; };
  preference.addEventListener('change', updateSystemTheme);
  onScopeDispose(() => preference.removeEventListener('change', updateSystemTheme));

  const isDark = computed(() => store.theme === 'system' ? systemDark.value : store.theme === 'dark');
  watch(isDark, dark => {
    root.dataset.appearance = dark ? 'dark' : 'light';
  }, { immediate: true });
  watch(() => store.typography, ({ fontFamily, fontSize }) => {
    root.dataset.fontFamily = fontFamily;
    root.style.setProperty('--app-font-size-value', String(fontSize));
  }, { immediate: true });
  return {
    isDark,
    toggleAppearance: () => store.setTheme(isDark.value ? 'light' : 'dark'),
  };
}
