import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { configurePortableSplash, themedPortableScript } from '../../scripts/portableSplashTarget.mjs';

test('the installed NSIS portable template keeps its extraction, launch and cleanup around the themed splash', () => {
  const require = createRequire(import.meta.url);
  const builder = path.dirname(require.resolve('app-builder-lib/package.json'));
  const template = readFileSync(path.join(builder, 'templates/nsis/portable.nsi'), 'utf8');
  const script = themedPortableScript(template);
  assert.doesNotMatch(script, /BgImage::/);
  assert.match(script, /Call ShowWorkBoardSplash[\s\S]+!insertmacro extractEmbeddedAppPackage[\s\S]+Call CloseWorkBoardSplash[\s\S]+ExecWait/);
  assert.match(script, /SetErrorLevel \$0[\s\S]+RMDir \/r \$INSTDIR/);
  assert.throws(() => themedPortableScript(template.replace('BgImage::Redraw', 'changed')), /Unexpected electron-builder/);
});

test('only the portable compiler receives the splash hook and it is attached once', () => {
  const compile = () => {};
  const setup = { name: 'nsis', executeMakensis: compile };
  const portable = { name: 'portable', executeMakensis: compile };
  configurePortableSplash(setup);
  configurePortableSplash(portable);
  assert.equal(setup.executeMakensis, compile);
  const hooked = portable.executeMakensis;
  assert.notEqual(hooked, compile);
  configurePortableSplash(portable);
  assert.equal(portable.executeMakensis, hooked);
});
