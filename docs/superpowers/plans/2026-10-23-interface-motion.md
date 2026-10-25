# Interface motion refinement

Request: smooth page navigation and opening elements in the established minimal Apple-inspired desktop design. Use the installed UI/UX skill to improve motion.

Guidance: `ui-ux-pro-max` UX search verified decelerating entry, faster exits, interruptible transitions, preserved focus and reduced motion. Its Vue search had no match; implementation follows the installed `vue-best-practices` Transition reference. [Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion) supports brief purposeful and cancellable motion. [MDN dialog transitions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#transitioning_dialog_elements) documents native top-layer transitions.

## Design and implementation

Use the existing palette/layout. One shared motion scale: controls140ms, page entry280ms/exit180ms, surface entry300ms/exit160ms. Limit motion to opacity and small transforms, and keep controls usable during entry. Route transitions retain a single active feature view. Native modal controllers cancel superseded animations from their current frame; presentation-only record presence preserves a closing surface without changing business state. Menu/popup exits retain their visual elements until finished and release focus safely. Reduced motion removes spatial animation and all timing delays.

- [x] Shared motion tokens and native dialog controller with cancellation/reduced-motion tests.
- [x] Page/menu/popover transitions and light press feedback.
- [x] Instruction/task cards and confirmations keep native focus/guards and animate both directions.
- [x] Real Electron verification: actual mid-animation frames, rapid reversal/navigation, reduced motion, retained geometry, full business smoke.
- [x] Review, documentation and updated Windows artifacts.

## Verification record

- `npm run check`: 76 tests passed, including six new controller tests for entry/exit, interrupted exit, stale completion, disposal and system reduced-motion changes. Renderer/preload built successfully.
- `npm run test:desktop`: passed with real rendered intermediate opacities of 0.327 (page), 0.307 (instruction), 0.375 (filter), 0.312 (menu) and 0.309 (task). The transparent click-through test window keeps the compositor active without presenting test UI to the user.
- Existing business smoke passed: CRUD, 27-row filtered Excel, calendar counts/tasks, SQLite-lock recovery, unsaved close protection, database isolation, both themes and all five viewport geometries.
- Rapid navigation left one final page; emulated reduced motion opened/closed cards and popovers with no running animation or visual delay. Keyboard focus and draft preservation passed.
- Read-only motion integration review found no remaining material issues. A presentation-only closing instruction now permits navigation; genuine pending writes continue to guard it.
- `npm run build:win` succeeded. Installer: `release/Work Board Setup 0.1.0.exe` (96,999,147 bytes); portable: `release/Work Board 0.1.0.exe` (96,771,289 bytes).
