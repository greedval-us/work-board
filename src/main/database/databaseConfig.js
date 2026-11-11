export const DATABASE_CONFIG = Object.freeze({
  APPLICATION_ID: 0x57424f41,
  BUSY_TIMEOUT_MS: 5000,
  LEGACY_SCHEMA_VERSION: 1,
  REGISTRY_SCHEMA_VERSION: 2,
  ATTACHMENTS_SCHEMA_VERSION: 3,
  INSTRUCTION_DETAILS_SCHEMA_VERSION: 4,
  INSTRUCTION_EXTENSION_SCHEMA_VERSION: 5,
  CONTROL_SCHEDULE_SCHEMA_VERSION: 6,
  LOCATION_FILE: 'database-location.json',
  LEGACY_DIRECTORY: 'data',
  LEGACY_FILENAME: 'work-board.sqlite',
  CONFIG_FILE_MODE: 0o600,
});

// Versioned identity checks are independent of the active database lifecycle.
export const REQUIRED_DATABASE_COLUMNS = Object.freeze({
  instructions: Object.freeze({
    [DATABASE_CONFIG.REGISTRY_SCHEMA_VERSION]: Object.freeze([
      'id', 'control_date', 'incoming_number', 'instruction_number', 'title', 'summary', 'deadline',
      'executor', 'status', 'execution_mark', 'instruction_number_search', 'executor_search',
      'execution_mark_search', 'created_at', 'updated_at',
    ]),
    [DATABASE_CONFIG.INSTRUCTION_DETAILS_SCHEMA_VERSION]: Object.freeze(['source', 'control_type']),
    [DATABASE_CONFIG.INSTRUCTION_EXTENSION_SCHEMA_VERSION]: Object.freeze(['extended_until']),
    [DATABASE_CONFIG.CONTROL_SCHEDULE_SCHEMA_VERSION]: Object.freeze(['control_schedule']),
  }),
  calendar_tasks: Object.freeze({
    [DATABASE_CONFIG.REGISTRY_SCHEMA_VERSION]: Object.freeze(['id', 'title', 'date', 'description', 'priority', 'completed', 'created_at', 'updated_at']),
  }),
  attachments: Object.freeze({
    [DATABASE_CONFIG.ATTACHMENTS_SCHEMA_VERSION]: Object.freeze(['id', 'instruction_id', 'task_id', 'name', 'relative_path', 'size', 'created_at']),
  }),
});
