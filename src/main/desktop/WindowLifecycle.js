export class WindowLifecycle {
  constructor({ app, getWindow, createTray, buildMenu, logger = console, platform = process.platform }) {
    Object.assign(this, { app, getWindow, createTray, buildMenu, logger, platform });
    this.tray = null;
    this.quitting = false;
  }

  initializeTray() {
    if (this.platform !== 'win32') return false;
    if (this.hasTray()) return true;
    let tray;
    try {
      tray = this.createTray();
      tray.setToolTip('Work Board');
      tray.setContextMenu(this.buildMenu([
        { label: 'Открыть Work Board', click: () => this.restoreWindow() },
        { type: 'separator' },
        { label: 'Выход', click: () => this.requestQuit() },
      ]));
      tray.on('click', () => this.restoreWindow());
      this.tray = tray;
      return this.hasTray();
    } catch (error) {
      this.logger.error('Failed to create Work Board tray:', error);
      this.destroyTray(tray);
      return false;
    }
  }

  hasTray() {
    return Boolean(this.tray && !this.tray.isDestroyed());
  }

  restoreWindow() {
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return null;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return window;
  }

  requestQuit() {
    this.beforeQuit();
    this.app.quit();
  }

  beforeQuit() {
    this.quitting = true;
  }

  attachWindow(window) {
    window.on('close', event => {
      if (this.platform === 'win32' && this.hasTray() && !this.quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    let resolvingClose = false;
    window.webContents.on('will-prevent-unload', async () => {
      if (resolvingClose || window.isDestroyed()) return;
      resolvingClose = true;
      try {
        // The renderer owns both the unsaved-change dialog and pending-operation guard.
        // It must be visible before either can explain why an explicit Exit is blocked.
        this.restoreWindow();
        const allowed = await window.webContents.executeJavaScript(`(async () => {
          const allowed = await window.__workBoardConfirmClose?.();
          if (allowed) window.__workBoardAllowClose = true;
          return allowed;
        })()`);
        if (allowed) {
          if (this.quitting) this.app.quit();
          else if (!window.isDestroyed()) window.close();
        } else this.quitting = false;
      } catch (error) {
        this.quitting = false;
        this.logger.error('Failed to resolve unsaved changes:', error);
      } finally { resolvingClose = false; }
    });
  }

  destroyTray(tray) {
    try {
      if (tray && !tray.isDestroyed()) tray.destroy();
    } catch (error) {
      this.logger.error('Failed to destroy Work Board tray:', error);
    }
  }

  shutdown() {
    const tray = this.tray;
    this.tray = null;
    this.destroyTray(tray);
  }
}
