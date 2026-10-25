import { createRouter, createWebHashHistory } from 'vue-router';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'Registry', component: () => import('../views/Registry.vue'), meta: { title: 'Реестр указаний' } },
    { path: '/calendar', name: 'Calendar', component: () => import('../views/Calendar.vue'), meta: { title: 'Календарь и задачи' } },
    { path: '/settings', name: 'Settings', component: () => import('../views/Settings.vue'), meta: { title: 'Настройки' } },
    { path: '/info', name: 'Info', component: () => import('../views/Info.vue'), meta: { title: 'О приложении' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
