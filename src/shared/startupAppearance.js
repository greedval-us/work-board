import { APP_APPEARANCE_STYLES, DEFAULT_SETTINGS, THEMES } from './constants/settings.js';

// Only these two public identifiers may cross the startup or lock-screen boundary.
export function startupAppearance({ theme, appearanceStyle } = {}) {
  return {
    theme: THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.theme,
    appearanceStyle: Object.hasOwn(APP_APPEARANCE_STYLES, appearanceStyle) ? appearanceStyle : DEFAULT_SETTINGS.appearanceStyle,
  };
}

export function appearanceFromSearch(search) {
  const query = new URLSearchParams(search);
  return startupAppearance({ theme: query.get('theme'), appearanceStyle: query.get('style') });
}

export function applyStartupAppearance(root, { theme, appearanceStyle }, systemDark) {
  root.dataset.startupTheme = theme;
  root.dataset.appearanceStyle = appearanceStyle;
  root.dataset.appearance = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}
