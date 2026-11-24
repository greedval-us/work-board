// Win32 STATIC and animation controls accept uncompressed bottom-up BGR bitmaps.
export function bitmapPixels(image) {
  const { width, height } = image.getSize();
  const input = image.toBitmap();
  const stride = (width * 3 + 3) & ~3;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    let offset = (height - y - 1) * stride;
    for (let x = 0; x < width; x++, offset += 3) {
      const source = (y * width + x) * 4;
      input.copy(pixels, offset, source, source + 3);
    }
  }
  return pixels;
}

function dibHeader(width, height, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(24, 14);
  header.writeUInt32LE(size, 20);
  return header;
}

export function bitmapFile(image) {
  const { width, height } = image.getSize();
  const pixels = bitmapPixels(image);
  const header = Buffer.alloc(14);
  header.write('BM');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  return Buffer.concat([header, dibHeader(width, height, pixels.length), pixels]);
}

function chunk(id, ...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const header = Buffer.alloc(8);
  header.write(id);
  header.writeUInt32LE(size, 4);
  return Buffer.concat([header, ...parts, Buffer.alloc(size % 2)]);
}

export function animationFile(width, height, frames, fps) {
  const frameSize = frames[0].length;
  const header = Buffer.alloc(56);
  header.writeUInt32LE(Math.round(1e6 / fps));
  header.writeUInt32LE(frameSize * fps, 4);
  header.writeUInt32LE(0x10, 12); // AVIF_HASINDEX
  header.writeUInt32LE(frames.length, 16);
  header.writeUInt32LE(1, 24);
  header.writeUInt32LE(frameSize, 28);
  header.writeUInt32LE(width, 32);
  header.writeUInt32LE(height, 36);
  const stream = Buffer.alloc(56);
  stream.write('vidsDIB ');
  stream.writeUInt32LE(1, 20);
  stream.writeUInt32LE(fps, 24);
  stream.writeUInt32LE(frames.length, 32);
  stream.writeUInt32LE(frameSize, 36);
  stream.writeInt32LE(-1, 40);
  stream.writeInt16LE(width, 52);
  stream.writeInt16LE(height, 54);
  const format = chunk('LIST', Buffer.from('strl'), chunk('strh', stream), chunk('strf', dibHeader(width, height, frameSize)));
  const index = Buffer.alloc(frames.length * 16);
  let offset = 4; // from the beginning of 'movi'
  const samples = frames.map((frame, i) => {
    index.write('00db', i * 16);
    index.writeUInt32LE(0x10, i * 16 + 4); // every raw frame is a keyframe
    index.writeUInt32LE(offset, i * 16 + 8);
    index.writeUInt32LE(frame.length, i * 16 + 12);
    const sample = chunk('00db', frame);
    offset += sample.length;
    return sample;
  });
  return chunk('RIFF', Buffer.from('AVI '), chunk('LIST', Buffer.from('hdrl'), chunk('avih', header), format),
    chunk('LIST', Buffer.from('movi'), ...samples), chunk('idx1', index));
}
