export const IPC_CHANNELS = Object.freeze({
  app: Object.freeze({ getInfo: 'app:get-info' }),
  database: Object.freeze({ getStatus: 'database:get-status', create: 'database:create', open: 'database:open' }),
  settings: Object.freeze({
    get: 'settings:get',
    setTheme: 'settings:set-theme',
    addRegistryOption: 'settings:add-registry-option',
    updateRegistryOption: 'settings:update-registry-option',
    removeRegistryOption: 'settings:remove-registry-option',
    setExecutorContact: 'settings:set-executor-contact',
  }),
  instructions: Object.freeze({
    list: 'instructions:list', get: 'instructions:get', create: 'instructions:create', update: 'instructions:update',
    remove: 'instructions:remove', export: 'instructions:export', exportControlCard: 'instructions:export-control-card',
  }),
  tasks: Object.freeze({ list: 'tasks:list', get: 'tasks:get', create: 'tasks:create', update: 'tasks:update', remove: 'tasks:remove' }),
  calendar: Object.freeze({ month: 'calendar:month', day: 'calendar:day' }),
  attachments: Object.freeze({ list: 'attachments:list', pick: 'attachments:pick', release: 'attachments:release', download: 'attachments:download' }),
  analytics: Object.freeze({ summary: 'analytics:summary' }),
  notifications: Object.freeze({ list: 'notifications:list', acknowledge: 'notifications:acknowledge' }),
});
