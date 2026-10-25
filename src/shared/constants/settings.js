export const THEMES = Object.freeze(['light', 'dark']);
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'light' });

export function validateTheme(theme) {
  if (!THEMES.includes(theme)) throw new ValidationError('Недопустимая тема оформления.');
  return theme;
}
import { ValidationError } from '../errors.js';

