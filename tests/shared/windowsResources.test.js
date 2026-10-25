import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import { Resource } from 'resedit';
import { applyWindowsResources } from '../../scripts/windowsResources.mjs';

for (const is32Bit of [true, false]) {
  test(`Windows resources retain the manifest and embed every icon size (${is32Bit ? 'x86' : 'x64'})`, () => {
    const executable = NtExecutable.createEmpty(is32Bit);
    const resource = NtExecutableResource.from(executable);
    const manifest = Buffer.from('<assembly><trustInfo>asInvoker</trustInfo></assembly>');
    resource.entries.push({ type: 24, id: 1, lang: 1033, codepage: 0, bin: manifest });
    resource.outputResource(executable);
    const source = Buffer.from(executable.generate());
    const result = applyWindowsResources(source, {
      icon: readFileSync(new URL('../../src/public/icons/app.ico', import.meta.url)),
      productName: 'Work Board', filename: 'Work Board.exe', version: '1.2.3', companyName: 'Work Board',
    });
    const edited = NtExecutableResource.from(NtExecutable.from(result));
    assert.deepEqual(Buffer.from(edited.entries.find(entry => entry.type === 24).bin), manifest);
    const info = Resource.VersionInfo.fromEntries(edited.entries)[0];
    const strings = info.getStringValues({ lang: 1033, codepage: 1200 });
    assert.equal(strings.ProductName, 'Work Board');
    assert.equal(strings.FileVersion, '1.2.3.0');
    assert.equal(strings.OriginalFilename, 'Work Board.exe');
    const group = Resource.IconGroupEntry.fromEntries(edited.entries)[0];
    assert.equal(group.icons.length, 7);
    const expected = readFileSync(new URL('../../src/public/icons/app-256.png', import.meta.url));
    assert.ok(edited.entries.some(entry => entry.type === 3 && Buffer.from(entry.bin).equals(expected)));
    assert.notDeepEqual(result, source);
  });
}
