import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeIco, encodeIcns } from '../../scripts/lib/iconFormats.mjs';

test('ICO directory encodes little endian payload offsets and the 256 pixel sentinel', () => {
  const bytes = encodeIco([
    { size: 16, bytes: Buffer.from('small') },
    { size: 256, bytes: Buffer.from('large') },
    { size: 512, bytes: Buffer.from('omitted') },
  ]);
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), 2);
  assert.equal(bytes[6], 16);
  assert.equal(bytes[7], 16);
  assert.equal(bytes.readUInt16LE(10), 1);
  assert.equal(bytes.readUInt16LE(12), 32);
  assert.equal(bytes.readUInt32LE(14), 5);
  assert.equal(bytes.readUInt32LE(18), 38);
  assert.equal(bytes[22], 0);
  assert.equal(bytes[23], 0);
  assert.equal(bytes.readUInt32LE(30), 5);
  assert.equal(bytes.readUInt32LE(34), 43);
  assert.equal(bytes.subarray(38).toString(), 'smalllarge');
});

test('ICNS file and image chunks include their headers in big endian lengths', () => {
  const bytes = encodeIcns([
    { size: 16, bytes: Buffer.from('small') },
    { size: 24, bytes: Buffer.from('omitted') },
    { size: 512, bytes: Buffer.from('large') },
  ]);
  assert.equal(bytes.subarray(0, 4).toString(), 'icns');
  assert.equal(bytes.readUInt32BE(4), 34);
  assert.equal(bytes.subarray(8, 12).toString(), 'icp4');
  assert.equal(bytes.readUInt32BE(12), 13);
  assert.equal(bytes.subarray(16, 21).toString(), 'small');
  assert.equal(bytes.subarray(21, 25).toString(), 'ic09');
  assert.equal(bytes.readUInt32BE(25), 13);
  assert.equal(bytes.subarray(29).toString(), 'large');
});
