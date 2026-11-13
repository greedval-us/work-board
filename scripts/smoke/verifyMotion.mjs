import assert from 'node:assert/strict';

export async function verifyMotion(driver) {
  const { window, js, wait, click, navigate, openFilters, pressKey, resize, screenshot } = driver;

  // Reduced motion must remove visual delays without changing focus or editing.
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wait("matchMedia('(prefers-reduced-motion: reduce)').matches");
  await click('Новая задача', '.calendar-page-heading button');
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  assert.equal(await js("document.querySelector('.calendar-task-dialog').getAnimations().filter(a=>a.playState==='running').length"), 0);
  assert.equal(await js("document.querySelector('.calendar-task-dialog').dataset.motionState"), undefined);
  await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
  await wait("!document.querySelector('.calendar-task-dialog[open]')");
  await navigate('/', 'Реестр указаний');
  await openFilters();
  assert.equal(await js("document.querySelector('.registry-filters').getAnimations().filter(a=>a.playState==='running').length"), 0);
  await pressKey('Escape');
  await wait("!document.querySelector('.registry-filters[data-open=true]')");
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await js("document.querySelector('nav a[href=\"#/calendar\"]').click(); document.querySelector('nav a[href=\"#/settings\"]').click(); document.querySelector('nav a[href=\"#/\"]').click()");
  await wait("document.querySelector('h1')?.textContent === 'Реестр указаний' && location.hash === '#/' && !document.querySelector('.workspace-enter-active,.workspace-leave-active')");
  assert.equal(await js("document.querySelectorAll('.page').length"), 1);
  console.log('Motion rapid navigation and reduced-motion checks passed.');
  await navigate('/calendar', 'Календарь и задачи');
  await resize(720, 640);
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  await screenshot('calendar-compact.png');
}
