import assert from 'node:assert/strict';
import { APP_APPEARANCE_STYLES } from '../../src/shared/constants/settings.js';

function luminance(cssColor) {
  const channels = cssColor.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  assert.ok(channels, `Expected an opaque sRGB color, got ${cssColor}`);
  const [r, g, b] = channels.slice(1).map(channel => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function verifyAppearanceStyles({ js, wait, pressKey, screenshot }, mode) {
  const palettes = new Set();
  const createIcons = new Set();
  const registryIcons = new Set();
  let minimum = Infinity;
  for (const style of Object.keys(APP_APPEARANCE_STYLES)) {
    const option = `button[name=appearance-style][value="${style}"]`;
    await js(`document.querySelector('${option}').focus()`);
    await pressKey('Space');
    await wait(`document.querySelector('${option}').matches(':enabled[aria-pressed=true]') &&
      document.documentElement.dataset.appearanceStyle === '${style}' && document.documentElement.dataset.appearance === '${mode}'`);
    assert.equal(await js(`document.activeElement.matches('${option}')`), true, 'Keep keyboard focus on the chosen style');
    const [createIcon, registryIcon] = await js(`['.storage-actions [data-action-icon=create]', '.nav-item .nav-symbol svg'].map(selector =>
      [...document.querySelector(selector).querySelectorAll('path')].map(path => path.getAttribute('d')).join(' '))`);
    createIcons.add(createIcon);
    registryIcons.add(registryIcon);
    const samples = await js(`(async () => {
      const pairs = [
        ['body', 'body'],
        ['.details-list dt', '.details-list'],
        ['select[name=appearance-font-family]', 'select[name=appearance-font-family]'],
        ['.nav-item-active', '.nav-item-active'],
      ];
      const navigation = document.querySelector('.nav-item-active');
      await Promise.all(navigation.getAnimations().map(animation => animation.finished));
      return pairs.map(([text, surface]) => [
        text, getComputedStyle(document.querySelector(text)).color, getComputedStyle(document.querySelector(surface)).backgroundColor,
      ]);
    })()`);
    palettes.add(JSON.stringify(samples));
    for (const [element, foreground, background] of samples) {
      const a = luminance(foreground);
      const b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${style}/${mode} ${element} contrast is ${ratio.toFixed(2)}:1`);
      minimum = Math.min(minimum, ratio);
    }
    if ((mode === 'dark' && ['witcher', 'cyberpunk'].includes(style)) || (mode === 'light' && style === 'harry-potter')) {
      await screenshot(`settings-${style}-${mode}.png`);
    }
  }
  assert.equal(palettes.size, Object.keys(APP_APPEARANCE_STYLES).length, `Distinct palettes in ${mode} mode`);
  assert.equal(createIcons.size, palettes.size, 'Each theme has its own create icon');
  assert.equal(registryIcons.size, palettes.size, 'Each theme has its own registry icon');
  console.log(`Appearance ${mode}: ${palettes.size} styles, minimum sampled text contrast ${minimum.toFixed(2)}:1.`);
}
