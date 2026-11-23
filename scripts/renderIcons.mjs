import { app, BrowserWindow } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeIco, encodeIcns } from './lib/iconFormats.mjs';

const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
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
    const data = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      await image.decode();
      return ${JSON.stringify(ICON_SIZES)}.map(size => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    })()`);
    const images = ICON_SIZES.map((size, index) => ({ size, bytes: Buffer.from(data[index], 'base64') }));
    for (const { size, bytes } of images) writeFileSync(new URL(`app-${size}.png`, directory), bytes);

    writeFileSync(new URL('app.ico', directory), encodeIco(images));
    writeFileSync(new URL('app.icns', directory), encodeIcns(images));
    console.log(`Icons generated from app.svg: ${ICON_SIZES.join(', ')} px, ICO and ICNS.`);
  } catch (cause) {
    console.error(cause);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
}).catch(cause => { console.error(cause); app.exit(1); });
