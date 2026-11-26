import { createRouter, createWebHashHistory } from 'vue-router';
import { registryLocation } from '../features/registry/registryLocation.js';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'Registry', component: () => import('../features/registry/RegistryPage.vue'), meta: { title: 'Реестр контроля' } },
    { path: '/closed-control', redirect: to => registryLocation(true, to.query) },
    { path: '/calendar', name: 'Calendar', component: () => import('../features/calendar/CalendarPage.vue'), meta: { title: 'Календарь и задачи' } },
    { path: '/tasks', name: 'Tasks', component: () => import('../features/tasks/TasksPage.vue'), meta: { title: 'Задачи' } },
    { path: '/analytics', name: 'Analytics', component: () => import('../features/analytics/AnalyticsPage.vue'), meta: { title: 'Аналитика контроля' } },
    {
      path: '/planning-control', name: 'PlanningControl', component: () => import('../features/planning/PlanningPage.vue'),
      meta: { title: 'Контроль планирования' },
    },
    {
      path: '/planning-analytics', name: 'PlanningAnalytics', component: () => import('../features/planning/PlanningAnalyticsPage.vue'),
      meta: { title: 'Аналитика планирования' },
    },
    { path: '/settings', name: 'Settings', component: () => import('../features/settings/SettingsPage.vue'), meta: { title: 'Настройки' } },
    { path: '/info', name: 'Info', component: () => import('./AboutPage.vue'), meta: { title: 'О приложении' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
