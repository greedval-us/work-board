const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;
const ICO_IMAGE_TYPE = 1;
const ICO_MAX_SIZE = 256;
const ICO_COLOR_PLANES = 1;
const ICO_BITS_PER_PIXEL = 32;
const ICO_HEADER_OFFSET = { imageType: 2, imageCount: 4 };
const ICO_ENTRY_OFFSET = { width: 0, height: 1, planes: 4, bitDepth: 6, byteLength: 8, payload: 12 };
const ICNS_HEADER_BYTES = 8;
const ICNS_LENGTH_OFFSET = 4;
const ICNS_IMAGE_TYPES = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };

export function encodeIco(images) {
  // PNG-backed ICO entries keep alpha transparency at every Windows DPI.
  const entries = images.filter(({ size }) => size <= ICO_MAX_SIZE);
  const directory = Buffer.alloc(ICO_HEADER_BYTES + entries.length * ICO_ENTRY_BYTES);
  directory.writeUInt16LE(ICO_IMAGE_TYPE, ICO_HEADER_OFFSET.imageType);
  directory.writeUInt16LE(entries.length, ICO_HEADER_OFFSET.imageCount);
  let payloadOffset = directory.length;
  entries.forEach(({ size, bytes }, index) => {
    const entry = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES;
    directory[entry + ICO_ENTRY_OFFSET.width] = directory[entry + ICO_ENTRY_OFFSET.height] = size === ICO_MAX_SIZE ? 0 : size;
    directory.writeUInt16LE(ICO_COLOR_PLANES, entry + ICO_ENTRY_OFFSET.planes);
    directory.writeUInt16LE(ICO_BITS_PER_PIXEL, entry + ICO_ENTRY_OFFSET.bitDepth);
    directory.writeUInt32LE(bytes.length, entry + ICO_ENTRY_OFFSET.byteLength);
    directory.writeUInt32LE(payloadOffset, entry + ICO_ENTRY_OFFSET.payload);
    payloadOffset += bytes.length;
  });
  return Buffer.concat([directory, ...entries.map(({ bytes }) => bytes)]);
}

function icnsChunk(type, bytes) {
  const header = Buffer.alloc(ICNS_HEADER_BYTES);
  header.write(type);
  header.writeUInt32BE(header.length + bytes.length, ICNS_LENGTH_OFFSET);
  return Buffer.concat([header, bytes]);
}

export function encodeIcns(images) {
  const chunks = images.filter(({ size }) => ICNS_IMAGE_TYPES[size])
    .map(({ size, bytes }) => icnsChunk(ICNS_IMAGE_TYPES[size], bytes));
  return icnsChunk('icns', Buffer.concat(chunks));
}
