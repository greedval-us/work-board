import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { app, BrowserWindow } from 'electron';
import { APP_APPEARANCE_STYLES } from '../src/shared/constants/settings.js';
import { animationFile, bitmapFile, bitmapPixels } from './lib/portableBitmap.mjs';
import { PROJECT_ROOT } from './lib/runtime.mjs';

const directory = process.argv[2];
const width = 540;
const height = 270;
app.setPath('userData', path.join(directory, 'capture-profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

async function render() {
  const window = new BrowserWindow({ width, height, useContentSize: true, frame: false, show: false,
    webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } });
  const page = window.webContents;
  // Render only the initial document and its CSS/images; no desktop services or user profile.
  page.session.webRequest.onBeforeRequest((request, done) => done({ cancel: request.resourceType === 'script' }));
  await page.loadFile(path.join(PROJECT_ROOT, 'build/renderer/index.html'));
  const layout = {};
  for (const style of Object.keys(APP_APPEARANCE_STYLES)) {
    for (const mode of ['light', 'dark']) {
      const key = `${style}-${mode}`;
      const bounds = await page.executeJavaScript(`(async () => {
        const root = document.documentElement;
        root.dataset.appearanceStyle = ${JSON.stringify(style)};
        root.dataset.appearance = ${JSON.stringify(mode)};
        document.querySelector('#startup-message').textContent = 'Распаковываем приложение…';
        const signal = document.querySelector('.startup-signal');
        signal.style.animation = 'none';
        signal.style.transform = 'translateX(0)';
        await document.querySelector('.startup-art img').decode();
        const art = getComputedStyle(document.querySelector('.startup-art')).backgroundImage;
        if (art !== 'none') {
          const image = new Image();
          image.src = art.slice(4, -1).replace(/^"|"$/g, '');
          await image.decode();
        }
        const rect = document.querySelector('.startup-track').getBoundingClientRect();
        const x = Math.floor(rect.x), y = Math.floor(rect.y);
        return { x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y };
      })()`);
      const capture = async rect => {
        // Give Chromium a compositor frame after each change before copying pixels.
        await page.executeJavaScript('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
        return page.capturePage(rect);
      };
      writeFileSync(path.join(directory, key + '.bmp'), bitmapFile(await capture()));
      const frames = [];
      for (let i = 0; i <= 12; i++) {
        const position = 75 * (1 - Math.cos(Math.PI * i / 12));
        await page.executeJavaScript(`document.querySelector('.startup-signal').style.transform = 'translateX(${position}%)'`);
        frames.push(bitmapPixels(await capture(bounds)));
      }
      if (frames[0].equals(frames.at(-1))) throw new Error('The portable progress bar did not move: ' + key);
      const loop = frames.concat(frames.slice(1, -1).reverse());
      writeFileSync(path.join(directory, key + '.avi'), animationFile(bounds.width, bounds.height, loop, 10));
      layout[key] = bounds;
    }
  }
  writeFileSync(path.join(directory, 'layout.json'), JSON.stringify({ width, height, variants: layout }));
  window.destroy();
}

app.whenReady().then(render).then(() => app.quit(), cause => { console.error(cause); app.exit(1); });
