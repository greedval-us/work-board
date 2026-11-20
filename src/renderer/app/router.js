import { createRouter, createWebHashHistory } from 'vue-router';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'Registry', component: () => import('../features/registry/RegistryPage.vue'), meta: { title: 'Реестр указаний' } },
    { path: '/closed-control', name: 'ClosedControl', component: () => import('../features/registry/RegistryPage.vue'), props: { closed: true }, meta: { title: 'Закрытый контроль' } },
    { path: '/calendar', name: 'Calendar', component: () => import('../features/calendar/CalendarPage.vue'), meta: { title: 'Календарь и задачи' } },
    { path: '/tasks', name: 'Tasks', component: () => import('../features/tasks/TasksPage.vue'), meta: { title: 'Задачи' } },
    { path: '/analytics', name: 'Analytics', component: () => import('../features/analytics/AnalyticsPage.vue'), meta: { title: 'Аналитика' } },
    { path: '/settings', name: 'Settings', component: () => import('../features/settings/SettingsPage.vue'), meta: { title: 'Настройки' } },
    { path: '/info', name: 'Info', component: () => import('./AboutPage.vue'), meta: { title: 'О приложении' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
