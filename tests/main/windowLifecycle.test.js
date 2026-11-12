import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { WindowLifecycle } from '../../src/main/lifecycle/WindowLifecycle.js';

function fixture(options = {}) {
  const window = Object.assign(new EventEmitter(), {
    visible: true, minimized: false, destroyed: false, focused: false, closeCalls: 0,
    isDestroyed() { return this.destroyed; },
    isMinimized() { return this.minimized; },
    hide() { this.visible = false; }, show() { this.visible = true; },
    restore() { this.minimized = false; }, focus() { this.focused = true; },
    close() { this.closeCalls++; },
  });
  const page = { __workBoardConfirmClose: async () => false };
  window.webContents = Object.assign(new EventEmitter(), {
    executeJavaScript: script => runInNewContext(script, { window: page }),
  });
  const tray = Object.assign(new EventEmitter(), {
    destroyed: false, destroyCalls: 0,
    isDestroyed() { return this.destroyed; },
    destroy() { this.destroyed = true; this.destroyCalls++; },
    setToolTip(value) { this.tooltip = value; },
    setContextMenu(value) { this.menu = value; },
  });
  const app = { quitCalls: 0, quit() { this.quitCalls++; } };
  const errors = [];
  const lifecycle = new WindowLifecycle({
    app, platform: 'win32', getWindow: () => window,
    createTray: () => tray, buildMenu: template => template,
    logger: { error: (...args) => errors.push(args) }, ...options,
  });
  lifecycle.attachWindow(window);
  const attemptClose = () => {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    window.emit('close', event);
    return event;
  };
  const preventUnload = () => window.webContents.listeners('will-prevent-unload')[0]();
  return { lifecycle, app, window, tray, page, errors, attemptClose, preventUnload };
}

test('Windows close hides a live window only after the tray is available', () => {
  const f = fixture();
  assert.equal(f.attemptClose().defaultPrevented, false);
  assert.equal(f.lifecycle.initializeTray(), true);
  assert.equal(f.attemptClose().defaultPrevented, true);
  assert.equal(f.window.visible, false);
  assert.equal(f.window.destroyed, false);
  assert.equal(f.app.quitCalls, 0);
});

test('tray clicks and Open restore hidden or minimized windows', () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  for (const open of [() => f.tray.emit('click'), () => f.tray.menu.find(item => item.label === 'Открыть Work Board').click()]) {
    f.window.visible = false; f.window.minimized = true; f.window.focused = false;
    open();
    assert.equal(f.window.visible, true);
    assert.equal(f.window.minimized, false);
    assert.equal(f.window.focused, true);
  }
  f.window.destroyed = true;
  assert.equal(f.lifecycle.restoreWindow(), null);
});

test('tray Exit requests a real application quit and bypasses hiding', () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.tray.menu.find(item => item.label === 'Выход').click();
  assert.equal(f.app.quitCalls, 1);
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('an external quit also bypasses close-to-tray', () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.lifecycle.beforeQuit();
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('a hidden dirty window is restored before asking the existing close guard', async () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.attemptClose();
  f.page.__workBoardConfirmClose = async () => {
    assert.equal(f.window.visible, true);
    assert.equal(f.window.focused, true);
    return false;
  };
  f.lifecycle.requestQuit();
  await f.preventUnload();
  assert.equal(f.app.quitCalls, 1);
  assert.equal(f.page.__workBoardAllowClose, undefined);
  assert.equal(f.attemptClose().defaultPrevented, true);
});

test('accepted unsaved changes resume application quit with renderer permission', async () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.page.__workBoardConfirmClose = async () => true;
  f.lifecycle.requestQuit();
  await f.preventUnload();
  assert.equal(f.page.__workBoardAllowClose, true);
  assert.equal(f.app.quitCalls, 2);
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('a pending operation can veto Exit and allow a later retry', async () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  let pending = true;
  f.page.__workBoardConfirmClose = async () => !pending;
  f.lifecycle.requestQuit();
  await f.preventUnload();
  assert.equal(f.app.quitCalls, 1);
  assert.equal(f.attemptClose().defaultPrevented, true);
  pending = false;
  f.lifecycle.requestQuit();
  await f.preventUnload();
  assert.equal(f.app.quitCalls, 3);
  assert.equal(f.page.__workBoardAllowClose, true);
});

test('ordinary close still resumes after confirmation without a tray', async () => {
  const f = fixture();
  f.page.__workBoardConfirmClose = async () => true;
  await f.preventUnload();
  assert.equal(f.window.closeCalls, 1);
  assert.equal(f.app.quitCalls, 0);
});

test('overlapping unload requests share one confirmation', async () => {
  const f = fixture();
  let confirmations = 0;
  let finish;
  f.page.__workBoardConfirmClose = () => { confirmations++; return new Promise(resolve => { finish = resolve; }); };
  const pending = f.preventUnload();
  await f.preventUnload();
  assert.equal(confirmations, 1);
  finish(false);
  await pending;
});

test('failed close confirmation cancels quit and leaves the window recoverable', async () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.page.__workBoardConfirmClose = async () => { throw new Error('renderer stopped'); };
  f.lifecycle.requestQuit();
  await f.preventUnload();
  assert.equal(f.errors.length, 1);
  assert.equal(f.attemptClose().defaultPrevented, true);
});

test('tray construction failure falls back to ordinary close', () => {
  const f = fixture({ createTray: () => { throw new Error('shell unavailable'); } });
  assert.equal(f.lifecycle.initializeTray(), false);
  assert.equal(f.errors.length, 1);
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('partial tray setup failure disposes the icon and falls back to ordinary close', () => {
  const f = fixture({ buildMenu: () => { throw new Error('menu unavailable'); } });
  assert.equal(f.lifecycle.initializeTray(), false);
  assert.equal(f.tray.destroyCalls, 1);
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('non-Windows platforms preserve ordinary close behavior', () => {
  const f = fixture({ platform: 'linux', createTray: () => { throw new Error('must not create a tray'); } });
  assert.equal(f.lifecycle.initializeTray(), false);
  assert.equal(f.errors.length, 0);
  assert.equal(f.attemptClose().defaultPrevented, false);
});

test('tray shutdown is idempotent and a destroyed tray never hides the window', () => {
  const f = fixture();
  f.lifecycle.initializeTray();
  f.lifecycle.shutdown();
  f.lifecycle.shutdown();
  assert.equal(f.tray.destroyCalls, 1);
  assert.equal(f.attemptClose().defaultPrevented, false);
});
