import { CONTROL_CARD_OPTION_LABELS, REGISTRY_OPTION_LABELS } from '../../shared/constants/settings.js';
import { validateOffice, validateRegistryOption, validateTheme, validateTypography } from '../../shared/settings.js';
import { ValidationError } from '../../shared/errors.js';
import { validateEnum, validateRecord, validateText } from '../../shared/validation.js';

function optionIndex(field, options, value) {
  const index = options.indexOf(value);
  if (index === -1) throw new ValidationError(`В списке «${REGISTRY_OPTION_LABELS[field]}» этот вариант больше не найден.`);
  return index;
}

function assertUniqueOption(field, options, value, currentIndex = -1) {
  const normalized = value.toLowerCase();
  if (options.some((option, index) => index !== currentIndex && option.toLowerCase() === normalized)) {
    throw new ValidationError(`В списке «${REGISTRY_OPTION_LABELS[field]}» уже есть такой вариант.`);
  }
}

function executorContactsAfterEdit(settings, executor, value, previousExecutor = executor) {
  const fields = validateRecord(value, 'Контакты исполнителя');
  const contact = { executor };
  for (const [field, label] of Object.entries(CONTROL_CARD_OPTION_LABELS)) {
    const option = validateText(fields[field], label).trim();
    if (option) optionIndex(field, settings.registryOptions[field], option);
    contact[field] = option;
  }
  const contacts = settings.executorContacts.filter(item => item.executor !== previousExecutor && item.executor !== executor);
  if (contact.department || contact.executorPhone) contacts.push(contact);
  return contacts;
}

function relatedSettings(settings, field, previousValue, nextValue, contact) {
  const changes = {};
  if (contact !== undefined) {
    if (field !== 'executor') throw new ValidationError('Контакты можно указать только для исполнителя.');
    changes.executorContacts = executorContactsAfterEdit(settings, nextValue, contact, previousValue);
  } else if (previousValue !== undefined && previousValue !== nextValue
    && settings.executorContacts.some(item => item[field] === previousValue)) {
    changes.executorContacts = settings.executorContacts
      .map(item => item[field] === previousValue ? { ...item, [field]: nextValue } : item)
      .filter(item => item.executor && (item.department || item.executorPhone));
  }
  if (field === 'office' && settings.office === previousValue && previousValue !== nextValue) changes.office = nextValue;
  return changes;
}

export class SettingsService {
  constructor(repository) { this.repository = repository; }

  get() { return this.repository.get(); }

  setTheme(value) { return this.repository.saveAppearance({ theme: validateTheme(value) }); }

  setTypography(value) { return this.repository.saveAppearance({ typography: validateTypography(value) }); }

  setOffice(value) {
    const office = validateOffice(value);
    return this.repository.updateRegistry(settings => {
      const options = settings.registryOptions.office;
      if (office) optionIndex('office', options, office);
      // Older databases may store their only office in the selected value.
      return { registryOptions: { office: options }, office };
    });
  }

  addRegistryOption(field, value, contact) {
    const option = validateRegistryOption(field, value);
    return this.repository.updateRegistry(settings => {
      const options = settings.registryOptions[field];
      assertUniqueOption(field, options, option);
      return { registryOptions: { [field]: [...options, option] }, ...relatedSettings(settings, field, undefined, option, contact) };
    });
  }

  updateRegistryOption(field, previousValue, value, contact) {
    const option = validateRegistryOption(field, value);
    return this.repository.updateRegistry(settings => {
      const options = [...settings.registryOptions[field]];
      const index = optionIndex(field, options, previousValue);
      assertUniqueOption(field, options, option, index);
      options[index] = option;
      return { registryOptions: { [field]: options }, ...relatedSettings(settings, field, previousValue, option, contact) };
    }, { field, previousValue, value: option });
  }

  removeRegistryOption(field, value) {
    validateEnum(field, REGISTRY_OPTION_LABELS, 'Справочник');
    return this.repository.updateRegistry(settings => {
      const options = [...settings.registryOptions[field]];
      options.splice(optionIndex(field, options, value), 1);
      return { registryOptions: { [field]: options }, ...relatedSettings(settings, field, value, '') };
    });
  }

  setExecutorContact(executor, value) {
    return this.repository.updateRegistry(settings => {
      optionIndex('executor', settings.registryOptions.executor, executor);
      return { executorContacts: executorContactsAfterEdit(settings, executor, value) };
    });
  }
}
