import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { effectScope, nextTick, reactive } from 'vue';
import { useAppearance } from '../../src/renderer/app/useAppearance.js';

function setup(t, theme, matches) {
  const preference = new EventTarget();
  preference.matches = matches;
  const root = { dataset: {}, style: { setProperty() {} } };
  const store = reactive({
    theme, appearanceStyle: 'standard', typography: { fontFamily: 'inter', fontSize: 14 },
    setTheme(value) { this.theme = value; },
  });
  const scope = effectScope();
  t.after(() => scope.stop());
  const appearance = scope.run(() => useAppearance({ store, root, preference }));

  async function changePreference(value) {
    preference.matches = value;
    preference.dispatchEvent(Object.assign(new Event('change'), { matches: value }));
    await nextTick();
  }
  return { root, store, preference, appearance, scope, changePreference };
}

test('system appearance follows the OS and releases its listener when unmounted', async t => {
  const f = setup(t, 'system', true);
  assert.equal(f.root.dataset.appearance, 'dark');
  assert.equal(f.appearance.isDark.value, true);

  await f.changePreference(false);
  assert.equal(f.root.dataset.appearance, 'light');
  assert.equal(f.store.theme, 'system');
  assert.equal(f.appearance.isDark.value, false);

  f.scope.stop();
  assert.equal(getEventListeners(f.preference, 'change').length, 0);
});

test('the quick toggle pins the opposite displayed theme until system is selected again', async t => {
  const f = setup(t, 'system', true);
  f.appearance.toggleAppearance();
  await nextTick();
  assert.equal(f.store.theme, 'light');
  assert.equal(f.root.dataset.appearance, 'light');

  await f.changePreference(false);
  await f.changePreference(true);
  assert.equal(f.root.dataset.appearance, 'light');

  f.store.setTheme('system');
  await nextTick();
  assert.equal(f.root.dataset.appearance, 'dark');
});

test('changing the style updates the root and keeps following system color changes', async t => {
  const f = setup(t, 'system', false);
  assert.equal(f.root.dataset.appearanceStyle, 'standard');
  f.store.appearanceStyle = 'harry-potter';
  await nextTick();
  assert.equal(f.root.dataset.appearanceStyle, 'harry-potter');
  assert.equal(f.root.dataset.appearance, 'light');
  await f.changePreference(true);
  assert.equal(f.root.dataset.appearanceStyle, 'harry-potter');
  assert.equal(f.root.dataset.appearance, 'dark');
});
