import { APP_APPEARANCE_STYLES, DEFAULT_SETTINGS } from '../../shared/constants/settings.js';
import { normalizeSearch } from '../../shared/registry.js';
import { validateTheme, validateTypography } from '../../shared/settings.js';
import { ValidationError } from '../../shared/errors.js';

const registryOptionKey = field => `registryOptions.${field}`;
const EXECUTOR_CONTACTS_KEY = 'executorContacts';
const APPEARANCE_STYLE_KEY = 'appearanceStyle';
const TYPOGRAPHY_KEY = 'typography';
const OFFICE_KEY = 'office';
const INSTRUCTION_OPTION_COLUMNS = Object.freeze({
  documentType: ['document_type', 'document_type_search'],
  source: ['source'],
  executor: ['executor', 'executor_search'],
});

function readTypography(value) {
  if (value !== undefined) {
    try { return validateTypography(JSON.parse(value)); }
    catch (error) {
      if (!(error instanceof SyntaxError || error instanceof ValidationError)) throw error;
    }
  }
  return { ...DEFAULT_SETTINGS.typography };
}

function readExecutorContacts(value) {
  if (value === undefined) return [];
  const contacts = JSON.parse(value);
  if (!Array.isArray(contacts) || contacts.some(contact => !contact || typeof contact.executor !== 'string'
    || typeof contact.department !== 'string' || typeof contact.executorPhone !== 'string')) {
    throw new TypeError('Контакты исполнителей имеют неверный формат.');
  }
  return contacts;
}

function readRegistryOptions(value, defaults) {
  if (value === undefined) return [...defaults];
  const options = JSON.parse(value);
  if (!Array.isArray(options) || options.some(option => typeof option !== 'string')) {
    throw new TypeError('Список вариантов справочника имеет неверный формат.');
  }
  return options;
}

export class SettingsRepository {
  constructor(database) { this.database = database; }

  get() {
    const rows = this.database.connection.prepare('SELECT key, value FROM app_settings').all();
    const settings = new Map(rows.map(({ key, value }) => [key, value]));
    const registryOptions = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.registryOptions).map(([field, defaults]) => [
      field, readRegistryOptions(settings.get(registryOptionKey(field)), defaults),
    ]));
    let office = settings.get(OFFICE_KEY) ?? DEFAULT_SETTINGS.office;
    if (office) {
      const normalized = office.toLowerCase();
      const matchingIndex = registryOptions.office.findIndex(value => value.toLowerCase() === normalized);
      if (matchingIndex === -1) registryOptions.office.unshift(office);
      else office = registryOptions.office[matchingIndex];
    }
    const appearanceStyle = settings.get(APPEARANCE_STYLE_KEY);
    return {
      theme: validateTheme(settings.get('theme') ?? DEFAULT_SETTINGS.theme),
      appearanceStyle: Object.hasOwn(APP_APPEARANCE_STYLES, appearanceStyle) ? appearanceStyle : DEFAULT_SETTINGS.appearanceStyle,
      registryOptions,
      typography: readTypography(settings.get(TYPOGRAPHY_KEY)),
      executorContacts: readExecutorContacts(settings.get(EXECUTOR_CONTACTS_KEY)),
      office,
    };
  }

  saveAppearance({ theme, appearanceStyle, typography }) {
    return this.database.transaction(() => {
      if (theme !== undefined) this.#set('theme', theme);
      if (appearanceStyle !== undefined) this.#set(APPEARANCE_STYLE_KEY, appearanceStyle);
      if (typography !== undefined) this.#set(TYPOGRAPHY_KEY, JSON.stringify(typography));
      return this.get();
    });
  }

  updateRegistry(change, renamedOption) {
    return this.database.transaction(() => {
      const settings = this.get();
      const changes = change(settings);
      const { registryOptions = {}, executorContacts, office } = changes;
      for (const [field, options] of Object.entries(registryOptions)) {
        this.#set(registryOptionKey(field), JSON.stringify(options));
      }
      if (executorContacts !== undefined) this.#set(EXECUTOR_CONTACTS_KEY, JSON.stringify(executorContacts));
      if (office !== undefined) this.#set(OFFICE_KEY, office);
      if (renamedOption) this.#renameInstructionOption(renamedOption);
      return { ...settings, ...changes, registryOptions: { ...settings.registryOptions, ...registryOptions } };
    });
  }

  #renameInstructionOption({ field, previousValue, value }) {
    if (previousValue === value || !Object.hasOwn(INSTRUCTION_OPTION_COLUMNS, field)) return;
    const columns = INSTRUCTION_OPTION_COLUMNS[field];
    const assignments = columns.map(column => `${column} = ?`).join(', ');
    const values = columns.length === 2 ? [value, normalizeSearch(value)] : [value];
    this.database.connection.prepare(`UPDATE instructions SET ${assignments}, updated_at = ? WHERE ${columns[0]} = ?`)
      .run(...values, new Date().toISOString(), previousValue);
  }

  #set(key, value) {
    this.database.connection.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }
}
