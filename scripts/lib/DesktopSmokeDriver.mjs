import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const TIMING = {
  conditionAttempts: 200, conditionPollMs: 50, entranceFrames: 30,
  resizeSettleMs: 230, screenshotSettleMs: 220,
};
const MOTION_OPACITY = { minimum: 0.01, maximum: 0.99 };
const PIXEL_TOLERANCE = 1;
const MIN_VISIBLE_REGISTRY_ROWS = 3;
const REGISTRY_COLUMNS = 8;
const CALENDAR_CELL_COUNTS = [35, 42];
const DEFAULT_VIEWPORT = { width: 1200, height: 780 };
const ADAPTIVE_VIEWPORTS = [
  { ...DEFAULT_VIEWPORT, screenshot: true },
  { width: 1024, height: 768 },
  { width: 720, height: 640, screenshot: true },
  { width: 720, height: 540 },
  { width: 1440, height: 900 },
];
const WORKSPACE_ELEMENTS = {
  registry: ['.registry-toolbar', '.registry-pagination'],
  calendar: ['.calendar-page-heading', '.calendar-month-panel', '.calendar-day-panel', '.calendar-add-task'],
};
const MEASURED_ELEMENTS = [
  '.main-content', '.page', ...WORKSPACE_ELEMENTS.registry,
  '.registry-table-scroll', '.registry-table thead', '.registry-table tbody tr',
  ...WORKSPACE_ELEMENTS.calendar, '.calendar-month-grid',
];

export function assertWorkspaceFits(measurements, kind, label) {
  const { width, height, elements, document: bounds } = measurements;
  const tolerance = PIXEL_TOLERANCE;
  assert.ok(bounds.width <= width + tolerance && bounds.height <= height + tolerance,
    `${label}: document overflow ${JSON.stringify(measurements)}`);
  const main = elements['.main-content'];
  const page = elements['.page'];
  assert.ok(main.scrollHeight <= main.clientHeight + tolerance, `${label}: main page scrolls ${JSON.stringify(measurements)}`);
  assert.ok(page.bottom <= main.bottom + tolerance && page.right <= main.right + tolerance, `${label}: clipped workspace`);
  for (const selector of WORKSPACE_ELEMENTS[kind]) {
    const element = elements[selector];
    assert.ok(element && element.y >= main.y - tolerance && element.bottom <= main.bottom + tolerance && element.right <= main.right + tolerance,
      `${label}: ${selector} is outside the workspace ${JSON.stringify(measurements)}`);
  }
  if (kind === 'registry') {
    const scroller = elements['.registry-table-scroll'];
    assert.equal(measurements.columns, REGISTRY_COLUMNS);
    assert.ok(scroller.scrollWidth <= scroller.clientWidth + tolerance, `${label}: default table needs horizontal scrolling`);
    const header = elements['.registry-table thead'];
    const row = elements['.registry-table tbody tr'];
    assert.ok(scroller.height + tolerance >= header.height + row.height * MIN_VISIBLE_REGISTRY_ROWS,
      `${label}: fewer than three visible rows ${JSON.stringify({ scroller: scroller.height, header: header.height, row: row.height })}`);
  } else {
    const grid = elements['.calendar-month-grid'];
    assert.ok(CALENDAR_CELL_COUNTS.includes(measurements.dates.length));
    assert.ok(measurements.dates.every(day => day.bottom <= grid.bottom + tolerance && day.y >= grid.y - tolerance && day.right <= grid.right + tolerance),
      `${label}: calendar dates are clipped`);
  }
}

export class DesktopSmokeDriver {
  errors = [];
  pageMotionVerified = false;

  constructor(window, { output, timing = {} } = {}) {
    this.window = window;
    this.output = output;
    this.timing = { ...TIMING, ...timing };
  }

  prepare = () => {
    const window = this.window;
    window.webContents.setBackgroundThrottling(false);
    queueMicrotask(() => window.removeAllListeners('ready-to-show'));
    // CSS transitions need a live compositor without intercepting user input.
    window.setOpacity(0);
    window.setSkipTaskbar(true);
    window.setIgnoreMouseEvents(true);
    window.webContents.on('preload-error', (_event, _path, error) => this.errors.push(error.message));
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error') this.errors.push(details.message);
    });
  };

  js = source => this.window.webContents.executeJavaScript(source);

  api = async (namespace, method, payload) => {
    const result = await this.js(`window.desktopAPI[${JSON.stringify(namespace)}][${JSON.stringify(method)}](${payload === undefined ? '' : JSON.stringify(payload)})`);
    assert.equal(typeof result?.ok, 'boolean', 'IPC must return an explicit result envelope');
    if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result.value;
  };

  wait = async (expression) => {
    for (let count = 0; count < this.timing.conditionAttempts; count++) {
      if (await this.js(expression)) return;
      await delay(this.timing.conditionPollMs);
    }
    throw new Error(`Renderer condition not met: ${expression}`);
  };

  click = async (text, selector = 'button') => {
    await this.js(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!node) throw new Error('Button missing: ' + ${JSON.stringify(text)}); node.click(); })()`);
  };

  navigate = async (route, heading) => {
    await this.js(`document.querySelector('nav a[href=${JSON.stringify('#' + route)}]').click()`);
    await this.wait(`document.querySelector('h1')?.textContent === ${JSON.stringify(heading)}`);
    if (!this.pageMotionVerified) {
      await this.verifyEntrance('.page', 'page navigation');
      this.pageMotionVerified = true;
    }
  };

  fill = async (selector, values) => {
    await this.js(`(() => { const fields = document.querySelectorAll(${JSON.stringify(selector)}); for (const [index, value] of Object.entries(${JSON.stringify(values)})) { const field=fields[Number(index)]; if (!field) throw new Error('Field missing '+index); field.value=value; field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true})); } })()`);
  };

  openFilters = async () => {
    await this.js("document.querySelector('.registry-filter-toggle').click()");
    await this.wait("Boolean(document.querySelector('.registry-filters:popover-open')) && document.querySelector('.registry-filter-toggle').getAttribute('aria-expanded') === 'true' && Boolean(document.activeElement?.closest('.registry-filters'))");
  };

  pressKey = async (keyCode, modifiers = []) => {
    this.window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    this.window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };

  verifyEntrance = async (selector, label) => {
    const frame = await this.js(`(async () => {
      let frame;
      for(let attempt=0;attempt<${this.timing.entranceFrames};attempt++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const element=document.querySelector(${JSON.stringify(selector)});
        const style=getComputedStyle(element);
        frame={opacity:Number(style.opacity),transform:style.transform,animations:element.getAnimations().map(a=>({state:a.playState,duration:a.effect.getTiming().duration}))};
        if(frame.opacity > ${MOTION_OPACITY.minimum} && frame.opacity < ${MOTION_OPACITY.maximum} && frame.animations.some(a=>a.state==='running')) break;
      }
      return frame;
    })()`);
    assert.ok(frame.animations.some(animation => animation.state === 'running' && animation.duration > 0), `${label}: no real entrance animation ${JSON.stringify(frame)}`);
    assert.ok(frame.opacity > 0 && frame.opacity < 1, `${label}: no intermediate fade frame ${JSON.stringify(frame)}`);
    console.log(`Motion ${label}: intermediate opacity ${frame.opacity.toFixed(3)}.`);
  };

  animationFrames = async (count = 2) => {
    await this.js(`(async () => { for(let frame=0;frame<${count};frame++) await new Promise(resolve => requestAnimationFrame(resolve)); })()`);
  };

  geometry = async (kind, label) => {
    await this.animationFrames();
    const measurements = await this.js(`(() => {
      const rect = selector => { const el=document.querySelector(selector); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}; };
      const selectors=${JSON.stringify(MEASURED_ELEMENTS)};
      return {width:innerWidth,height:innerHeight,document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},elements:Object.fromEntries(selectors.map(s=>[s,rect(s)])),dates:[...document.querySelectorAll('.calendar-date')].map(el=>{const r=el.getBoundingClientRect();return{right:r.right,bottom:r.bottom,x:r.x,y:r.y}}),columns:document.querySelectorAll('.registry-table th').length};
    })()`);
    assertWorkspaceFits(measurements, kind, label);
    console.log(`Adaptive ${label}: ${measurements.width}×${measurements.height}, workspace fits.`);
  };

  resize = async (width, height) => {
    this.window.setSize(width, height);
    await delay(this.timing.resizeSettleMs);
  };

  resizeDefault = async () => this.resize(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);

  resizeSweep = async (kind) => {
    for (const { width, height, screenshot } of ADAPTIVE_VIEWPORTS) {
      await this.resize(width, height);
      await this.geometry(kind, `${kind} ${width}×${height}`);
      if (screenshot) await this.screenshot(`${kind}-adaptive-${width}.png`);
    }
    await this.resizeDefault();
  };

  screenshot = async (name) => {
    // Hidden Chromium windows can retain an earlier backdrop-filter raster.
    const [width, height] = this.window.getContentSize();
    this.window.setContentSize(width + PIXEL_TOLERANCE, height);
    await this.animationFrames(1);
    this.window.setContentSize(width, height);
    await this.animationFrames();
    await delay(this.timing.screenshotSettleMs);
    writeFileSync(path.join(this.output, name), (await this.window.webContents.capturePage()).toPNG());
  };
}
