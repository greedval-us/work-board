export const IPC_CHANNELS = Object.freeze({
  app: Object.freeze({ getInfo: 'app:get-info' }),
  appLock: Object.freeze({
    getStatus: 'app-lock:get-status', configure: 'app-lock:configure',
    lock: 'app-lock:lock', unlock: 'app-lock:unlock',
    hasPendingNotifications: 'app-lock:has-pending-notifications',
  }),
  database: Object.freeze({ getStatus: 'database:get-status', create: 'database:create', open: 'database:open' }),
  settings: Object.freeze({
    get: 'settings:get',
    setTheme: 'settings:set-theme',
    setAppearanceStyle: 'settings:set-appearance-style',
    setTypography: 'settings:set-typography',
    setPlanningEnabled: 'settings:set-planning-enabled',
    setOffice: 'settings:set-office',
    addRegistryOption: 'settings:add-registry-option',
    updateRegistryOption: 'settings:update-registry-option',
    removeRegistryOption: 'settings:remove-registry-option',
    setExecutorContact: 'settings:set-executor-contact',
  }),
  instructions: Object.freeze({
    list: 'instructions:list', get: 'instructions:get', create: 'instructions:create', update: 'instructions:update',
    remove: 'instructions:remove', closeControl: 'instructions:close-control',
    export: 'instructions:export', exportControlCard: 'instructions:export-control-card',
  }),
  tasks: Object.freeze({
    list: 'tasks:list', get: 'tasks:get', create: 'tasks:create', update: 'tasks:update', remove: 'tasks:remove',
    setOccurrenceCompleted: 'tasks:set-occurrence-completed',
    moveOccurrence: 'tasks:move-occurrence',
  }),
  calendar: Object.freeze({ month: 'calendar:month', day: 'calendar:day' }),
  analytics: Object.freeze({ summary: 'analytics:summary' }),
  notifications: Object.freeze({ list: 'notifications:list', acknowledge: 'notifications:acknowledge' }),
});
