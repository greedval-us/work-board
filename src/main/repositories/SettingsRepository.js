import { DEFAULT_SETTINGS, REGISTRY_OPTION_LABELS, validateRegistryOption, validateTheme } from '../../shared/constants/settings.js';
import { ValidationError } from '../../shared/errors.js';
import { validateEnum } from '../../shared/validation.js';

const registryOptionKey = field => `registryOptions.${field}`;

function readRegistryOptions(value, defaults) {
  if (value === undefined) return [...defaults];
  const options = JSON.parse(value);
  if (!Array.isArray(options) || options.some(option => typeof option !== 'string')) {
    throw new TypeError('Список вариантов справочника имеет неверный формат.');
  }
  return options;
}

function assertUniqueRegistryOption(field, options, value, currentIndex = -1) {
  const normalized = value.toLowerCase();
  if (options.some((existing, index) => index !== currentIndex && existing.toLowerCase() === normalized)) {
    throw new ValidationError(`В списке «${REGISTRY_OPTION_LABELS[field]}» уже есть такой вариант.`);
  }
}

function findRegistryOptionIndex(field, options, value) {
  const index = options.indexOf(value);
  if (index === -1) {
    throw new ValidationError(`В списке «${REGISTRY_OPTION_LABELS[field]}» этот вариант больше не найден.`);
  }
  return index;
}

export class SettingsRepository {
  constructor(database) { this.database = database; }

  get() {
    const rows = this.database.connection.prepare('SELECT key, value FROM app_settings').all();
    const settings = new Map(rows.map(({ key, value }) => [key, value]));
    const registryOptions = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.registryOptions).map(([field, defaults]) => [
      field, readRegistryOptions(settings.get(registryOptionKey(field)), defaults),
    ]));
    return { theme: validateTheme(settings.get('theme') ?? DEFAULT_SETTINGS.theme), registryOptions };
  }

  setTheme(theme) {
    validateTheme(theme);
    return this.database.transaction(() => {
      this.#set('theme', theme);
      return this.get();
    });
  }

  addRegistryOption(field, value) {
    const option = validateRegistryOption(field, value);
    return this.#changeRegistryOptions(field, options => {
      assertUniqueRegistryOption(field, options, option);
      options.push(option);
    });
  }

  updateRegistryOption(field, previousValue, value) {
    const option = validateRegistryOption(field, value);
    return this.#changeRegistryOptions(field, options => {
      const index = findRegistryOptionIndex(field, options, previousValue);
      assertUniqueRegistryOption(field, options, option, index);
      options[index] = option;
    });
  }

  removeRegistryOption(field, value) {
    validateEnum(field, REGISTRY_OPTION_LABELS, 'Справочник');
    return this.#changeRegistryOptions(field, options => {
      options.splice(findRegistryOptionIndex(field, options, value), 1);
    });
  }

  #changeRegistryOptions(field, change) {
    return this.database.transaction(() => {
      const settings = this.get();
      const options = settings.registryOptions[field];
      change(options);
      this.#set(registryOptionKey(field), JSON.stringify(options));
      return settings;
    });
  }

  #set(key, value) {
    this.database.connection.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }
}
