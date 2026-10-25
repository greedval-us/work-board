export const ATTACHMENT_LIMITS = Object.freeze({
  FILES_PER_PICK: 100,
  PENDING_SELECTIONS: 1000,
  CHANGES_PER_SAVE: 1000,
  RELEASE_TOKENS: 1000,
});

export const ATTACHMENT_STORAGE = Object.freeze({
  ROOT_SUFFIX: '.files',
  STAGING_DIRECTORY: '.staging',
  DOWNLOAD_TEMP_SUFFIX: '.tmp',
});

export const DATABASE_FILE_SUFFIXES = Object.freeze(['', '-wal', '-shm']);
export const ATTACHMENT_FILE_NAME_PATTERN = /^[a-f0-9-]{36}$/;
