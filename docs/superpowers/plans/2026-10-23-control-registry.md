# Control Registry Implementation Plan

> **For agentic workers:** Implement tasks against the agreed interfaces below. Use test-driven-development for behavior and verification-before-completion for results.

**Goal:** Реестр указаний с CRUD/фильтрами, календарь задач, Excel и выбранная пользователем SQLite.
**Architecture:** Existing main/services/repositories + narrow preload IPC + Vue composition views. All business state persists in selected SQLite. Calendar derives controls from instructions.
**Tech Stack:** Existing JavaScript/ESM Electron/Vue stack; node:sqlite; ExcelJS for XLSX.
**Spec:** `docs/superpowers/specs/2026-10-23-control-registry-design.md`, approved by user 2026-10-23 with explicit instruction to implement.

## Global constraints

- Eight requested columns in their exact order. One final deadline.
- Date-only ISO strings; Russian case-insensitive literal substring filters; inclusive ranges.
- Existing rounded Apple-style UI, both themes, local storage only.
- Preserve old settings. Never overwrite an existing DB or mutate a foreign/newer DB.
- Database generations guard all business reads/mutations; stale forms and replies cannot affect another DB.

## Review focus

- Failed switch preserves active DB/path/data; missing file is not recreated silently.
- Unicode and SQL wildcard filters, date boundaries, leading-zero identifiers.
- Full filtered export rather than only current page, literal spreadsheet strings, filter metadata.
- Calendar counts change after edits/completion/deletion without duplicated controls.
- Unsaved forms, pending writes and cancelled dialogs remain recoverable.

## Shared interfaces

Instruction: `{id, controlDate, incomingNumber, instructionNumber, title, summary, deadline, executor, status, executionMark, createdAt, updatedAt}`.
Status: `pending | in_progress | completed`; labels «На контроле», «В работе», «Исполнено».
Filters: `{instructionNumber, deadlineFrom, deadlineTo, executor, status, executionMark}`.
List request: `{filters, sort:{field,direction}, offset, limit, generation}`; result `{items,total}`.
Task: `{id,title,date,description,priority,completed,createdAt,updatedAt}`, priority `normal | important | urgent`.
Calendar month result: `{days:[{date,controls,completedControls,tasks,completedTasks}]}`.
Calendar day result: `{instructions,tasks}`.

Preload namespaces: `instructions.list/get/create/update/remove/export`, `tasks.list/get/create/update/remove`, `calendar.month/day`, `database.getStatus/create/open`.
Business payloads always include `generation`; get/remove add `id`; create adds `data`; update adds `id,data`.
Database selection returns `{cancelled,status}`; status includes `{ready,filePath,generation,sqliteVersion,schemaVersion,message}`.
Renderer app store adds `revision`, `pendingOperations`, `touchData()`, `withOperation(fn)` and `selectDatabase(mode)`.

### Task 1: Domain and repositories

Owned files: `src/shared/registry.js`, `src/main/database/migrations.js`, new main repositories and `CalendarService.js`; tests.

- [x] Test CRUD persistence, validation, Unicode/literal filters, sorting/pagination and calendar aggregation before implementation.
- [x] Implement InstructionRepository(database): list(request), all(request), get(id), create(data), update(id,data), remove(id).
- [x] Implement TaskRepository(database): list({from,to}), get(id), create(data), update(id,data), remove(id).
- [x] Implement CalendarService(instructions,tasks): month({month}), day({date}).
- [x] Migrate from schema 1 preserving app_settings; run targeted tests.

### Task 2: Registry UI

Owned files: renderer registry view/components/service/store/composable and scoped registry styles.

- [x] Build applied-vs-draft filters, eight-column scrollable table, sort and 25/50/100 pagination.
- [x] Add accessible create/edit drawer, validation, save/cancel and deletion confirmation.
- [x] Use generation-bound requests and app.withOperation for mutations; increment revision on success.
- [x] Export current applied filters/sort; support empty/no-database/error/loading states and dirty form protection.

### Task 3: Calendar UI

Owned files: renderer calendar view/components/service/store/composable and scoped calendar styles.

- [x] Month navigation/Today, Monday-first grid, live counts and selected-day controls/tasks.
- [x] Task CRUD/completion/priority and instruction-card opening via registry navigation.
- [x] Date/urgency recalculation at midnight and focus; stale request protection.
- [x] Use generation-bound requests, busy counts and revision refresh.

### Task 4: Database switching, IPC and Excel integration

Owned by primary: database lifecycle/config/selection, main bootstrap/IPC, preload, app store, storage UI, routing/sidebar, export service and dependencies.

- [x] Test new/existing/legacy/foreign/newer/missing DB, config-write failure and generation guards.
- [x] Add first-run selection and safe candidate validation/swap; serialized native dialogs.
- [x] Wire named business APIs and safe user-facing errors; keep existing bridge restricted.
- [x] Test workbook read-back: eight columns, all filtered rows, metadata and string identifiers/formulas.
- [x] Implement export through native save dialog, preserving snapshot across async generation changes.
- [x] Update shell routes/navigation/storage settings and invalidate feature state on switch.

### Task 5: Verification and delivery

- [x] Full unit suite and renderer/preload build.
- [x] Real Electron smoke: fresh DB selection state, registry/task CRUD/filter/calendar, reopen, Excel and switch isolation.
- [x] Review complete implementation, fix material findings, inspect screenshots in both themes.
- [x] Rebuild Windows installer/portable and update README/architecture.

## Verification record — 2026-10-23

- `npm run check`: 70 tests passed; renderer and preload built successfully.
- `npm run test:desktop -- --dev`: real Electron/Vite scenario passed after final layout adjustments.
- `node scripts/checkDesktop.mjs`: built-resource scenario passed, including database-locked write recovery, unsaved window-close protection, stale generations, and XLSX read-back of all 27 filtered rows across pagination.
- Light/dark and compact-window screenshots inspected. The screenshot helper invalidates hidden Chromium layers before capturing a theme change; computed colors and the refreshed captures agree.
- Integration review completed. Damaged schema candidates are rejected before replacing the active connection; a failed task checkbox write leaves the persisted state visible. The obsolete desktop smoke entry now forwards to the current scenario.
- `npm run build:win`: NSIS installer and portable x64 EXE built successfully.
- Packaged ASAR matches all 40 application/build files. The packaged Electron runtime passed real SQLite and ExcelJS checks using the bundled dependency.
- Outputs: `release/Work Board Setup 0.1.0.exe` (96,999,584 bytes), `release/Work Board 0.1.0.exe` (96,771,771 bytes).
