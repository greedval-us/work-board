import { appearanceFromSearch, applyStartupAppearance, startupAppearance } from '../shared/startupAppearance.js';

async function start() {
  const root = document.documentElement;
  let appearance = appearanceFromSearch(window.location.search);
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const applyAppearance = () => applyStartupAppearance(root, appearance, preference.matches);
  applyAppearance();
  preference.addEventListener('change', applyAppearance);
  try {
    appearance = startupAppearance(await window.desktopAPI.app.whenReady());
    applyAppearance();
    document.getElementById('startup-message').textContent = 'Загружаем интерфейс…';
    const { mountApplication } = await import('./main.js');
    await mountApplication();
    preference.removeEventListener('change', applyAppearance);
  } catch (error) {
    console.error('Cannot start Work Board:', error);
    document.querySelector('#startup-message').textContent = 'Не удалось открыть приложение.';
    document.querySelector('.startup-track').hidden = true;
    const retry = document.querySelector('#startup-retry');
    retry.hidden = false;
    retry.addEventListener('click', () => window.location.reload(), { once: true });
  }
}

void start();
