# Maintainability refactor

> **For agentic workers:** Use focused parallel implementation and independent review, then verify the integrated result.

**Goal:** Reduce duplicated request orchestration and mixed responsibilities while preserving existing application behavior.

**Architecture:** Keep Electron main/preload/renderer boundaries and Pinia ownership intact. Extract narrow modules for schedule rules, schedule editing, and request lifecycle. Split desktop smoke into explicit sequential scenarios with shared fixtures.

**Tech Stack:** JavaScript ESM, Electron, Vue Composition API, Pinia, SQLite, node:test.

**Spec:** User request, `CONTRIBUTING.md`, and `docs/architecture.md`.

## Constraints

- Preserve public APIs, database schema, UI markup/styles, generations, revisions and stale-response guards.
- Keep domain policy visible; avoid generic base classes, new dependencies and speculative configuration.
- Work in the provided clean checkout; do not commit or publish changes.
- Preserve every desktop smoke assertion, its ordering and isolated temporary data.
- Existing historical migration literals and test expectation values remain intentional.

## Review focus

- Concurrent requests: stale successes/errors must not overwrite fresh state or clear its loading indicator.
- Calendar reads: month data is retained while loading; day data clears according to existing behavior.
- Schedule edits: navigation and invalid date moves must not dirty the instruction; history and actual dates survive.
- Vue bindings: props stay reactive, `v-model` and exposed focus methods retain their contracts.
- Desktop scenarios: handoffs preserve generation and identifiers; dialog cancellation consumes only the intended response.

## Task 1: Schedule editor

- [x] Characterize draft/date/navigation behavior with focused renderer tests.
- [x] Extract `controlScheduleView.js` for view projections and `useControlScheduleEditor.js` for editor state/actions.
- [x] Preserve the template and CSS of `InstructionControlSchedule.vue`.
- [x] Run focused tests and independently review the extraction.

## Task 2: Shared schedule domain

- [x] Add history normalization and date-swap characterization cases before extraction.
- [x] Split recurrence, validation, checkpoint projections and date moves under `src/shared/controlSchedule/`.
- [x] Retain `src/shared/controlSchedule.js` as the public facade with unchanged exports.
- [x] Run shared/downstream tests and independently compare old/new function bodies.

## Task 3: Store requests

- [x] Characterize forced refresh, cached failure, retained rows and newer-revision loading behavior.
- [x] Add a narrow request-channel abstraction; retain domain error/cache/receipt policies inside stores.
- [x] Share the identical calendar month/day request lifecycle with explicit per-reader clearing policy.
- [x] Independently review all four stores and run the integrated renderer tests.

## Task 4: Desktop smoke maintenance

- [x] Extract named scenarios with explicit inputs/outputs from `scripts/registrySmoke.mjs`.
- [x] Centralize fixture paths, dialog responses and repeated form selectors under `scripts/smoke/`.
- [x] Compare assertion counts and scenario order with the original; validate imports/syntax.
- [x] Run the real Electron smoke including background reminders.

## Task 5: Notification policy constants

- [x] Replace duplicated polling intervals with `shared/constants/notifications.js`.
- [x] Name native preview count/title limits beside their consumer and deduplicate renderer rescheduling.
- [x] Verify notification timer/lifecycle tests and rebuild after the final constant extraction.

## Completion

- [x] Update architecture documentation with module responsibilities and extension points.
- [x] Run `npm test`, `npm run build:client`, `npm run test:desktop` and `git diff --check`.
- [x] Record final evidence and any remaining limitations.

## Evidence

- Windows sandbox baseline fails on temporary-file rename (`EPERM`); first successful unrestricted run passes 429 tests. Use approved unrestricted test execution for meaningful file-operation checks.
- Schedule editor focused tests: 20/20; independent review including instruction draft tests: 23/23.
- Shared schedule and downstream tests: 49/49. Public exports and existing function bodies preserved.
- Independent store review and focused request-race suites: 58/58, no actionable findings.
- Smoke extraction retains all 210 assertions in eight scenarios; independent AST/order/handoff review found no actionable issues.
- Integrated `npm test`: 429/429, no skipped tests. Production build and real Electron smoke pass, including background/tray lifecycle with injected native delivery (no OS toast published).
- Notification policy extraction: 33/33 targeted tests and final full suite 429/429 pass; 15 regression tests were added over the 414-test starting suite.
- Main coordinator sizes: `registrySmoke.mjs` 926 → 64 lines; `InstructionControlSchedule.vue` 398 → 163; `calendarStore.js` 197 → 168. Schedule domain facade is six lines with four focused implementation modules.
- Final rerun after notification constants: production build, desktop workflow and background lifecycle all pass. Native Windows toast delivery itself uses an injected adapter in the existing smoke; installer packaging was not changed or rerun.
