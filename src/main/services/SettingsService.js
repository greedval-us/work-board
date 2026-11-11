export class SettingsService {
  constructor(repository) { this.repository = repository; }
  get() { return this.repository.get(); }
  setTheme(theme) { return this.repository.setTheme(theme); }
  addRegistryOption(field, value) { return this.repository.addRegistryOption(field, value); }
  updateRegistryOption(field, previousValue, value) { return this.repository.updateRegistryOption(field, previousValue, value); }
  removeRegistryOption(field, value) { return this.repository.removeRegistryOption(field, value); }
}
