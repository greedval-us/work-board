import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './app/App.vue';
import router from './app/router.js';
import { useErrorStore } from './app/errorStore.js';
import { installErrorHandling } from './app/installErrorHandling.js';
import './app/style.css';
import './ui/themedControls.css';
import './ui/motion.css';
import './features/notifications/notifications.css';

export async function mountApplication() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia).use(router);
  const removeErrorHandling = installErrorHandling({ app, errors: useErrorStore(pinia) });
  if (import.meta.hot) import.meta.hot.dispose(removeErrorHandling);
  await router.isReady();
  app.mount('#app');
}
