import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../src/public/icons/', import.meta.url);
const runtime = fileURLToPath(new URL('../output/icon-runtime/', import.meta.url));
mkdirSync(runtime, { recursive: true });
app.setPath('userData', runtime);
// Do not await app readiness at module scope: Electron must finish evaluating
// its ESM entry point before it can emit ready.
app.whenReady().then(async () => {
const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
try {
  await window.loadURL('about:blank');
  const svg = readFileSync(new URL('app.svg', directory), 'utf8');
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const data = await window.webContents.executeJavaScript(`(async () => {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
    await image.decode();
    return ${JSON.stringify(sizes)}.map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  })()`);
  const images = sizes.map((size, index) => ({ size, bytes: Buffer.from(data[index], 'base64') }));
  for (const { size, bytes } of images) writeFileSync(new URL(`app-${size}.png`, directory), bytes);

  // PNG-backed ICO entries keep alpha transparency at every Windows DPI.
  const entries = images.filter(({ size }) => size <= 256);
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, bytes }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  writeFileSync(new URL('app.ico', directory), Buffer.concat([header, ...entries.map(({ bytes }) => bytes)]));

  const types = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
  const chunks = images.filter(({ size }) => types[size]).map(({ size, bytes }) => {
    const chunk = Buffer.alloc(8);
    chunk.write(types[size]);
    chunk.writeUInt32BE(8 + bytes.length, 4);
    return Buffer.concat([chunk, bytes]);
  });
  const icns = Buffer.alloc(8);
  icns.write('icns');
  icns.writeUInt32BE(8 + chunks.reduce((length, chunk) => length + chunk.length, 0), 4);
  writeFileSync(new URL('app.icns', directory), Buffer.concat([icns, ...chunks]));
  console.log(`Icons generated from app.svg: ${sizes.join(', ')} px, ICO and ICNS.`);
} catch (cause) {
  console.error(cause);
  process.exitCode = 1;
} finally {
  window.destroy();
  app.quit();
}
}).catch(cause => { console.error(cause); app.exit(1); });
