import { computed, watch } from 'vue';
import { useAppStore } from '../stores/appStore.js';

export function useAppearance() {
  const store = useAppStore();
  watch(() => store.theme, (theme) => {
    document.documentElement.dataset.appearance = theme;
  }, { immediate: true });
  watch(() => store.typography, ({ fontFamily, fontSize }) => {
    const root = document.documentElement;
    root.dataset.fontFamily = fontFamily;
    root.style.setProperty('--app-font-size-value', String(fontSize));
  }, { immediate: true });
  return {
    isDark: computed(() => store.theme === 'dark'),
    toggleAppearance: () => store.setTheme(store.theme === 'dark' ? 'light' : 'dark'),
  };
}
