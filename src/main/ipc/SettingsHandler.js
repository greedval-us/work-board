import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';

export class SettingsHandler {
  constructor(settingsService, database) { this.settingsService = settingsService; this.database = database; }
  requests() {
    return {
      [channels.settings.get]: (payload = {}) => {
        this.database.assertGeneration?.(payload.generation);
        return this.settingsService.get();
      },
      [channels.settings.setTheme]: (payload) => {
        this.database.assertGeneration?.(payload?.generation);
        return this.settingsService.setTheme(payload?.theme);
      },
      [channels.settings.addRegistryOption]: (payload) => {
        this.database.assertGeneration(payload?.generation);
        return this.settingsService.addRegistryOption(payload?.field, payload?.value, payload?.contact);
      },
      [channels.settings.updateRegistryOption]: (payload) => {
        this.database.assertGeneration(payload?.generation);
        return this.settingsService.updateRegistryOption(payload?.field, payload?.previousValue, payload?.value, payload?.contact);
      },
      [channels.settings.removeRegistryOption]: (payload) => {
        this.database.assertGeneration(payload?.generation);
        return this.settingsService.removeRegistryOption(payload?.field, payload?.value);
      },
      [channels.settings.setExecutorContact]: (payload) => {
        this.database.assertGeneration(payload?.generation);
        return this.settingsService.setExecutorContact(payload?.executor, payload?.contact);
      },
    };
  }
}
