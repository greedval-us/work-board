# Windows background reminders

**Request:** Deliver deadline reminders through Windows even when the window is minimized or closed.

**Implementation choice:** Keep the existing Electron main process alive behind a Windows tray icon. Closing the window hides it and retains drafts; Open restores it. Exit explicitly stops the application and still resolves unsaved changes. A scheduled check in main runs independently of renderer visibility, on resume/unlock, and after data changes. This meets closed-window delivery without installing a service or changing Windows autostart. Full exit and computer shutdown stop delivery.

**Delivery:** Use Electron Notification with the existing deadline service and daily popup receipts. Aggregate outstanding deadlines into a single native toast. Record presentation only after the native show event; read status remains independent. A native-capability snapshot suppresses competing renderer popups, and native failures surface safely in the bell. Clicking a current notification restores the window and opens the bell through a narrow preload event, without replacing unsaved forms. Generation/day/occurrence validation prevents stale notifications acting on another database.

**Windows integration:** Match the process AppUserModelID to the existing NSIS app ID. Keep Windows permissions and quiet-mode settings under user control. No host startup/registry settings will be changed while developing or testing.

- [x] Main timer, delivery, failure/retry and stale-callback tests.
- [x] Windows tray, close/hide/restore, explicit exit and unsaved-change lifecycle tests.
- [x] Delivery metadata and safe native-click bridge with renderer tests.
- [x] Windows registration/packaging checks and documentation.
- [x] Full tests, production build and Electron background scenario with injected notification delivery.

Baseline: 370 tests, build and Electron smoke passed.

**Verification:** 412/412 tests pass. Production build, original desktop smoke and new background smoke all pass. Background smoke uses a real Electron window/tray/database and injects only native notification delivery: minimized delivery, close-to-tray, main-only external database changes/resume, native click restoration, daily deduplication, draft retention, cancelled/confirmed Exit and resource cleanup are verified. Native OS banners themselves were not sent during automated testing; installed NSIS delivery still needs manual verification under the user's Windows permissions/quiet-mode settings. Portable/dev registration remains best effort and is documented.

**Review fixes:** A click during renderer bootstrap could lose its bell-open intent; regression reproduced and fixed by deferring until database readiness and checking generation. Delivery warnings now clear after database changes or recovered receipt writes and distinguish persistence/check failures from OS delivery failures. Failed receipt writes retry without another toast; late Windows failures allow bounded session retries. `git diff --check` is clean; no commit or host autostart/shortcut installation performed.

Final independent scheduler review found no further blocking issues. A late failed event after Windows accepted delivery retains the persisted receipt; additional retries for that event are session-local. The restored bell screenshot `output/windows-background-notifications.png` was visually checked.
