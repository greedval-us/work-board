import { computed, watch } from 'vue';
import { useAppStore } from '../stores/appStore.js';

export function useAppearance() {
  const store = useAppStore();
  watch(() => store.theme, (theme) => {
    document.documentElement.dataset.appearance = theme;
  }, { immediate: true });
  return {
    isDark: computed(() => store.theme === 'dark'),
    toggleAppearance: () => store.setTheme(store.theme === 'dark' ? 'light' : 'dark'),
  };
}
