export class SettingsService {
  constructor(repository) { this.repository = repository; }
  get() { return this.repository.get(); }
  setTheme(theme) { return this.repository.setTheme(theme); }
  addRegistryOption(field, value, contact) { return this.repository.addRegistryOption(field, value, contact); }
  updateRegistryOption(field, previousValue, value, contact) { return this.repository.updateRegistryOption(field, previousValue, value, contact); }
  removeRegistryOption(field, value) { return this.repository.removeRegistryOption(field, value); }
  setExecutorContact(executor, contact) { return this.repository.setExecutorContact(executor, contact); }
}
