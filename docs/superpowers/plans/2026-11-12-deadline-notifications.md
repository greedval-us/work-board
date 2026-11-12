# Deadline reminders in the application

**Goal:** Add a header bell with unread reminders and a nonmodal popup so deadlines remain visible across all workspaces.

**Behavior:** Pending instructions use the effective final deadline; tasks use their planned date; unmarked scheduled intermediate controls use their effective date after individual moves. Include overdue dates and dates through today plus three calendar days. Completed records and marked checkpoints disappear. Each active deadline becomes a new reminder once per local day. Popup acknowledgement and read acknowledgement remain independent; opening the bell alone does not mark everything read.

**Design:** Main service composes existing repositories and the shared schedule domain. A dedicated receipt repository stores a namespaced value in the selected database's existing app_settings table. Named, generation-guarded IPC exposes list and acknowledge only. Renderer store owns snapshots, acknowledgements, safe errors and stale-response protection. A composable owns the minute/midnight/focus/visibility refresh lifecycle. One header component presents the bell and aggregated popup. Links open the record or exact checkpoint, retaining unsaved-change guards and allowing repeated opening.

**Scope:** In-application reminders while the application is running. Daily receipts survive restarts and are isolated per database. No operating-system background service is introduced. Preserve all existing uncommitted work.

- [x] Main aggregation, persistence, validation and named IPC with focused tests.
- [x] Renderer state, lifecycle and race tests.
- [x] Bell, popup, read controls, responsive styling and accessible keyboard behavior.
- [x] Guarded deep links to instructions, checkpoints and tasks.
- [x] Production build, complete tests, real Electron scenario and independent review.

**Baseline:** 332 unit/integration tests and Electron smoke passed after the checkpoint date feature.

**Verification:** 370/370 tests pass (38 additional tests). Production build and the real Electron smoke pass, including popup appearance, bell/read persistence, repeated task opening, exact moved-checkpoint navigation, completion/removal and compact panel bounds. Independent review reproduced a stale pre-acknowledgement read restoring unread state; a failing regression was added and fixed by checking the captured request ticket after the shared read resolves. Screenshots `output/deadline-notifications.png` and `output/deadline-notifications-compact.png` were visually checked; `git diff --check` is clean. Existing changes remain in the working tree, no commit created.

**Scale:** Rendering is bounded to 20 initial rows per urgency group with explicit show-more controls. The backend currently returns every applicable historical checkpoint; exceptionally long daily schedules still produce large snapshots.
