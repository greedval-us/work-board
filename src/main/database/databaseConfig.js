export const DATABASE_CONFIG = Object.freeze({
  APPLICATION_ID: 0x57424f41,
  BUSY_TIMEOUT_MS: 5000,
  // From schema 10 onward, new migrations record the application ID atomically.
  LAST_RECOVERABLE_UNSIGNED_VERSION: 10,
  REGISTRY_SCHEMA_VERSION: 2,
  ATTACHMENTS_SCHEMA_VERSION: 3,
  INSTRUCTION_DETAILS_SCHEMA_VERSION: 4,
  INSTRUCTION_EXTENSION_SCHEMA_VERSION: 5,
  CONTROL_SCHEDULE_SCHEMA_VERSION: 6,
  CLOSED_CONTROL_SCHEMA_VERSION: 7,
  DOCUMENT_TYPE_SCHEMA_VERSION: 8,
  TASK_RECURRENCE_SCHEMA_VERSION: 9,
  TASK_OCCURRENCE_MOVES_SCHEMA_VERSION: 10,
  PLANNING_SCHEMA_VERSION: 11,
  LOCATION_FILE: 'database-location.json',
  LEGACY_DIRECTORY: 'data',
  LEGACY_FILENAME: 'work-board.sqlite',
  CONFIG_FILE_MODE: 0o600,
});

// Versioned identity checks are independent of the active database lifecycle.
export const REQUIRED_DATABASE_COLUMNS = Object.freeze({
  plans: Object.freeze({
    [DATABASE_CONFIG.PLANNING_SCHEMA_VERSION]: Object.freeze([
      'id', 'control_date', 'incoming_number', 'instruction_number', 'document_type', 'source', 'title',
      'plan_item', 'summary', 'deadline', 'extended_until', 'executor', 'status', 'execution_mark', 'control_schedule',
      'instruction_number_search', 'document_type_search', 'executor_search', 'execution_mark_search',
      'created_at', 'updated_at', 'closed_at',
    ]),
  }),
  instructions: Object.freeze({
    [DATABASE_CONFIG.REGISTRY_SCHEMA_VERSION]: Object.freeze([
      'id', 'control_date', 'incoming_number', 'instruction_number', 'title', 'summary', 'deadline',
      'executor', 'status', 'execution_mark', 'instruction_number_search', 'executor_search',
      'execution_mark_search', 'created_at', 'updated_at',
    ]),
    [DATABASE_CONFIG.INSTRUCTION_DETAILS_SCHEMA_VERSION]: Object.freeze(['source', 'control_type']),
    [DATABASE_CONFIG.INSTRUCTION_EXTENSION_SCHEMA_VERSION]: Object.freeze(['extended_until']),
    [DATABASE_CONFIG.CONTROL_SCHEDULE_SCHEMA_VERSION]: Object.freeze(['control_schedule']),
    [DATABASE_CONFIG.CLOSED_CONTROL_SCHEMA_VERSION]: Object.freeze(['closed_at']),
    [DATABASE_CONFIG.DOCUMENT_TYPE_SCHEMA_VERSION]: Object.freeze(['document_type', 'document_type_search']),
  }),
  calendar_tasks: Object.freeze({
    [DATABASE_CONFIG.REGISTRY_SCHEMA_VERSION]: Object.freeze(['id', 'title', 'date', 'description', 'priority', 'completed', 'created_at', 'updated_at']),
    [DATABASE_CONFIG.TASK_RECURRENCE_SCHEMA_VERSION]: Object.freeze(['recurrence']),
  }),
  calendar_task_completions: Object.freeze({
    [DATABASE_CONFIG.TASK_RECURRENCE_SCHEMA_VERSION]: Object.freeze(['task_id', 'date']),
  }),
  calendar_task_moves: Object.freeze({
    [DATABASE_CONFIG.TASK_OCCURRENCE_MOVES_SCHEMA_VERSION]: Object.freeze(['task_id', 'original_date', 'target_date']),
  }),
  attachments: Object.freeze({
    [DATABASE_CONFIG.ATTACHMENTS_SCHEMA_VERSION]: Object.freeze(['id', 'instruction_id', 'task_id', 'name', 'relative_path', 'size', 'created_at']),
  }),
});
