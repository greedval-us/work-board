# Individual checkpoint dates and retrospective execution

**Goal:** Allow a person to move one planned intermediate checkpoint and record the date it was actually performed, including past dates.

**User choice:** Only the selected checkpoint moves; subsequent recurring dates retain their original anchor.

**Design:** Add optional `moves: [{ from, to }]` to existing schedule JSON. `from` identifies the original generated/custom occurrence, `to` is its effective planned date. Marks remain keyed by that planned `date`, with optional `actualDate`; legacy marks use `date` as their factual date. No database schema change is needed.

**Alternatives:** Changing the recurrence anchor would move subsequent dates (user rejected). Converting recurring schedules into a fixed date list would lose future recurrence and extension behavior. Per-date overrides preserve both.

**Behavior:** Calendar and pending/overdue filters use effective planned dates. Factual dates appear with marks and in the Word history. Planned moves stay within the instruction's control period and cannot collide with another scheduled or historical checkpoint. Factual dates are valid calendar dates independent of the planned period. Completion retains its existing nonblank-mark semantics.

**Compatibility:** Legacy JSON retains its shape when there are no new fields. Draft and IPC snapshots preserve the new fields without Vue metadata. Moving an existing mark preserves its original factual date. Explicit recurrence changes clear moves while retaining history. Current uncommitted changes must remain intact.

- [x] Shared domain: validation, move/back-to-origin helper, cross-month enumeration, earliest pending date, collision/history tests.
- [x] UI: per-row planned date move, editable factual date, safe errors, disabled guards and retained focus.
- [x] Drafts: clone and serialize moves/factual dates; regression failed first and then passed.
- [x] Integration: SQLite reopen, calendar/registry filters, factual date presentation and Word export.
- [x] Real Electron scenario: move one occurrence, backdate a mark, save/reopen, verify calendar and next occurrence.
- [x] Independent review, complete test suite, build and desktop smoke.

**Baseline:** 303 tests, production build and desktop smoke passed in the preceding refactor.

**Verification:** Independent review found two bounds-edit recovery issues: an out-of-period moved row could disappear before correction; custom source dates could be rejected despite a valid effective destination. Both were reproduced with failing tests and fixed. Invalid moved dates remain editable, moves can be cancelled without losing history, and custom bounds use effective dates. Explicit empty factual dates are rejected rather than silently replaced by planned dates.

**Final checks:** `npm test` passed 332/332 tests (29 added), no skips. `npm run test:desktop` passed the production build and real Electron scenario, including moving one date, recording past execution, save/reopen and cancellation preserving the mark. Expected injected DATABASE_LOCKED/VALIDATION/DATABASE_CHANGED failures stayed safely handled. `git diff --check` passed. Screenshot `output/checkpoint-dates.png` was visually checked. All existing user changes remain in the working tree; no commit created.
