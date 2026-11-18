import assert from 'node:assert/strict';
import { test } from 'node:test';
import builderConfig from '../../electron-builder.config.cjs';
import { registerWindowsAppIdentity } from '../../src/main/desktop/windowsIdentity.js';

test('Windows notifications use the identity registered by the NSIS Start menu shortcut', () => {
  const registeredIds = [];
  registerWindowsAppIdentity({
    app: { setAppUserModelId: id => registeredIds.push(id) },
    platform: 'win32',
  });

  assert.deepEqual(registeredIds, [builderConfig.appId]);
  assert.equal(builderConfig.appId, 'com.workboard.desktop', 'existing Start menu shortcuts use this ID');
  assert.equal(builderConfig.nsis.createStartMenuShortcut, true);
});

test('other platforms do not require the Windows-only identity API', () => {
  for (const platform of ['darwin', 'linux']) {
    assert.doesNotThrow(() => registerWindowsAppIdentity({ app: {}, platform }));
  }
});
