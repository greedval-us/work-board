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
    };
  }
}
