import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import { useErrorStore } from './stores/errorStore.js';
import { installErrorHandling } from './infrastructure/installErrorHandling.js';
import './style.css';
import './styles/motion.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia).use(router);
const removeErrorHandling = installErrorHandling({ app, errors: useErrorStore(pinia) });
app.mount('#app');
if (import.meta.hot) import.meta.hot.dispose(removeErrorHandling);
