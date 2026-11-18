export class SettingsService {
  constructor(repository) { this.repository = repository; }
  get() { return this.repository.get(); }
  setTheme(theme) { return this.repository.setTheme(theme); }
  setTypography(typography) { return this.repository.setTypography(typography); }
  setOffice(office) { return this.repository.setOffice(office); }
  addRegistryOption(field, value, contact) { return this.repository.addRegistryOption(field, value, contact); }
  updateRegistryOption(field, previousValue, value, contact) { return this.repository.updateRegistryOption(field, previousValue, value, contact); }
  removeRegistryOption(field, value) { return this.repository.removeRegistryOption(field, value); }
  setExecutorContact(executor, contact) { return this.repository.setExecutorContact(executor, contact); }
}
