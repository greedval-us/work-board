export class SettingsService {
  constructor(repository) { this.repository = repository; }
  get() { return this.repository.get(); }
  setTheme(theme) { return this.repository.setTheme(theme); }
}
