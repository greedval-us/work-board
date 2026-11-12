# Responsibility and error handling refactor

> **For agentic workers:** Use focused parallel tasks with regression tests, followed by an independent review.

**Goal:** Remove duplicated file operations, keep application requests out of UI components, and retain useful diagnostics without exposing internal errors.

**Architecture:** Keep the existing Electron main / preload / renderer boundaries. Main services coordinate exports through a shared atomic file writer; UI components retain draft and presentation state while stores own requests. Failed cleanup must not erase the original operation failure.

**Tech Stack:** JavaScript ESM, Electron, Vue Composition API, Pinia, SQLite, node:test.

**Spec:** User request in this chat and `CONTRIBUTING.md`, `docs/architecture.md`.

## Global constraints

- Preserve all existing uncommitted work and public IPC signatures.
- Keep database generations, revision guards, cancellation and editable drafts intact.
- No schema, dependency or visual changes; work in the current shared checkout without committing unrelated work.
- Add regression tests for changed failure behavior; run the complete suite, client build and desktop smoke.

## Review focus

- Cleanup failure after a failed write or transaction retains both diagnostic causes and the primary public error.
- Export cannot replace the working database or its companion files.
- A late attachment selection is released with its original owner context.
- Failed or cancelled report exports leave draft values intact and release pending-operation guards.
- Existing workbook snapshots and generation checks retain their timing.

## Task 1: Atomic file output

- [x] Add tests for failed writes/replacement/cleanup and protected database destinations.
- [x] Extract a shared main-process file writer; migrate XLSX, DOCX and attachment downloads.
- [x] Keep content generation and dialog orchestration in services; preserve cancellation and snapshot semantics.
- [x] Run file/export/attachment tests.

## Task 2: Attachment selection lifecycle

- [x] Reproduce late picker tokens leaking after disposal or owner change.
- [x] Centralize token release with the captured request context; release unaccepted results safely.
- [x] Verify disposal, changed context, failed cleanup and existing attachment draft behavior.

## Task 3: Report request ownership

- [x] Characterize report cancellation, errors, duplicate submissions and generation binding.
- [x] Move export orchestration from ControlCardDialog into a focused renderer store.
- [x] Keep report defaults, editable fields, motion and local draft lifecycle in the component.
- [x] Run targeted renderer tests.

## Task 4: Failure diagnostics

- [x] Reproduce rollback masking an operation or commit failure.
- [x] Introduce a narrowly scoped cleanup error carrying the primary cause and secondary errors.
- [x] Reuse synchronous cleanup handling for transaction rollback and rejected database connections; decode only this trusted wrapper at the public-error boundary.
- [x] Run transaction, database and IPC tests, then document the resulting responsibilities.

## Completion

- [x] Independent review of changed files, distinguishing pre-existing changes.
- [x] Full tests, production build and real Electron smoke pass.

## Evidence

- Baseline: 261 tests passed outside the Windows sandbox. The sandbox itself blocks temporary-file renames with EPERM.
- Transaction/connection regression tests failed as expected before the fix; 36 targeted cleanup/database/IPC tests passed afterwards.
- Renderer lifecycle regressions failed as expected before the fix; the complete renderer suite passed (125 tests).
- Independent review of cleanup and report-store changes: no actionable findings; 22 focused tests passed.
- Independent attachment review: no actionable findings; 17 focused tests passed.
- Atomic output review identified missing WAL/SHM protection when the database filename itself is an alias. The regression failed before the fix and passed afterwards; both original and canonical database names now protect their companion paths.
- Final `npm test`: 303/303 passed, no skipped tests (42 tests added to the baseline).
- `npm run build:client`: passed.
- `npm run test:desktop`: passed, including CRUD, attachments, XLSX and Word exports, database switching, error recovery and five window sizes. Deliberate DATABASE_LOCKED, VALIDATION and DATABASE_CHANGED cases logged the expected failures.
- `git diff --check`: passed. Existing uncommitted user changes were preserved; no commit was created.
