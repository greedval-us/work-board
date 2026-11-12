import { CONTROL_CARD_OPTION_LABELS, DEFAULT_SETTINGS, REGISTRY_OPTION_LABELS, validateRegistryOption, validateTheme } from '../../shared/constants/settings.js';
import { ValidationError } from '../../shared/errors.js';
import { validateEnum, validateRecord, validateText } from '../../shared/validation.js';

const registryOptionKey = field => `registryOptions.${field}`;
const EXECUTOR_CONTACTS_KEY = 'executorContacts';

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
    return {
      theme: validateTheme(settings.get('theme') ?? DEFAULT_SETTINGS.theme), registryOptions,
      executorContacts: readExecutorContacts(settings.get(EXECUTOR_CONTACTS_KEY)),
    };
  }

  setTheme(theme) {
    validateTheme(theme);
    return this.database.transaction(() => {
      this.#set('theme', theme);
      return this.get();
    });
  }

  addRegistryOption(field, value, contact) {
    const option = validateRegistryOption(field, value);
    return this.#changeRegistryOptions(field, (options, settings) => {
      assertUniqueRegistryOption(field, options, option);
      options.push(option);
      this.#applyOptionContact(settings, field, option, contact);
    });
  }

  updateRegistryOption(field, previousValue, value, contact) {
    const option = validateRegistryOption(field, value);
    return this.#changeRegistryOptions(field, (options, settings) => {
      const index = findRegistryOptionIndex(field, options, previousValue);
      assertUniqueRegistryOption(field, options, option, index);
      options[index] = option;
      this.#applyOptionContact(settings, field, option, contact, previousValue);
    });
  }

  removeRegistryOption(field, value) {
    validateEnum(field, REGISTRY_OPTION_LABELS, 'Справочник');
    return this.#changeRegistryOptions(field, (options, settings) => {
      options.splice(findRegistryOptionIndex(field, options, value), 1);
      this.#replaceContactOption(settings, field, value, '');
    });
  }

  setExecutorContact(executor, value) {
    return this.database.transaction(() => {
      const settings = this.get();
      findRegistryOptionIndex('executor', settings.registryOptions.executor, executor);
      this.#saveExecutorContact(settings, executor, value);
      return settings;
    });
  }

  #applyOptionContact(settings, field, option, contact, previousValue) {
    if (contact === undefined) {
      if (previousValue !== undefined && previousValue !== option) {
        this.#replaceContactOption(settings, field, previousValue, option);
      }
      return;
    }
    if (field !== 'executor') throw new ValidationError('Контакты можно указать только для исполнителя.');
    this.#saveExecutorContact(settings, option, contact, previousValue);
  }

  #saveExecutorContact(settings, executor, value, previousExecutor = executor) {
    const fields = validateRecord(value, 'Контакты исполнителя');
    const contact = { executor };
    for (const [field, label] of Object.entries(CONTROL_CARD_OPTION_LABELS)) {
      const option = validateText(fields[field], label).trim();
      if (option) findRegistryOptionIndex(field, settings.registryOptions[field], option);
      contact[field] = option;
    }
    const contacts = settings.executorContacts.filter(item => item.executor !== previousExecutor && item.executor !== executor);
    if (contact.department || contact.executorPhone) contacts.push(contact);
    this.#saveExecutorContacts(settings, contacts);
  }

  #replaceContactOption(settings, field, previousValue, nextValue) {
    if (!settings.executorContacts.some(contact => contact[field] === previousValue)) return;
    const contacts = settings.executorContacts
      .map(contact => contact[field] === previousValue ? { ...contact, [field]: nextValue } : contact)
      .filter(contact => contact.executor && (contact.department || contact.executorPhone));
    this.#saveExecutorContacts(settings, contacts);
  }

  #saveExecutorContacts(settings, contacts) {
    this.#set(EXECUTOR_CONTACTS_KEY, JSON.stringify(contacts));
    settings.executorContacts = contacts;
  }

  #changeRegistryOptions(field, change) {
    return this.database.transaction(() => {
      const settings = this.get();
      const options = settings.registryOptions[field];
      change(options, settings);
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
