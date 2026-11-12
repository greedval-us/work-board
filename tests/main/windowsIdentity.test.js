import assert from 'node:assert/strict';
import { test } from 'node:test';
import builderConfig from '../../electron-builder.config.cjs';
import { APP_USER_MODEL_ID, registerWindowsAppIdentity } from '../../src/main/notifications/windowsIdentity.js';

test('Windows notifications use the identity registered by the NSIS Start menu shortcut', () => {
  const registeredIds = [];
  registerWindowsAppIdentity({
    app: { setAppUserModelId: id => registeredIds.push(id) },
    platform: 'win32',
  });

  assert.deepEqual(registeredIds, [builderConfig.appId]);
  assert.equal(APP_USER_MODEL_ID, builderConfig.appId);
  assert.equal(builderConfig.nsis.createStartMenuShortcut, true);
});

test('other platforms do not require the Windows-only identity API', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.doesNotThrow(() => registerWindowsAppIdentity({ app: {}, platform }));
  }
});
