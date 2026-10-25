export class AppService {
  constructor(app) { this.app = app; }

  getInfo() {
    return {
      name: this.app.getName(),
      version: this.app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron,
      node: process.versions.node,
    };
  }
}
