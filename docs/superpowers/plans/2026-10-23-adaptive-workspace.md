# Adaptive workspace visual refinement

User request: improve the visual design, keep it minimal, avoid unnecessary scrolling, make the interface adapt dynamically. This refines the already approved local desktop product; its data and business flows stay in the existing architecture.

## Design

Use the existing Apple direction with SF Pro/Segoe UI, canvas #edeef2, panel #ffffff, text #1d1d1f, muted #6b6b73 and accent #0068d9, with the existing dark equivalents. Reduce repeated headings, inset cards, control shadows and padding. The registry and calendar are workspaces filling the available window, rather than long pages. Primary actions remain visible.

The chosen layout uses CSS grid/flex to divide the actual available height. A compact navigation rail saves width on normal desktop windows; users can expand it. Registry filters become a compact expandable control and the eight-column table uses the remaining width and height. The calendar divides its height into the actual number of weeks; its day panel gives both controls and tasks their own usable space. Internal scrolling remains available for genuinely long data lists and forms.

Alternatives considered: shrinking every element would hurt readability, while retaining the page layout would preserve the current excess scrolling. Viewport workspaces with progressive disclosure directly address the user's request.

## Component responsibilities

- AppSidebarLayout: viewport shell, adaptive rail and route transitions; business guards unchanged.
- AppSidebar: navigation and storage status, accessible icon labels.
- RegistryWorkspace / Filters / Table / Pagination: compact header and filters, readable table and fixed pagination; props/emits and applied filter behavior preserved.
- CalendarWorkspace / MonthCalendar / CalendarDayLists: full month within height and independently scrollable day lists; CRUD and keyboard navigation preserved.

## Execution and verification

- [x] Compact and simplify global chrome; adapt sidebar to actual window width.
- [x] Refine registry layout and filter disclosure.
- [x] Refine calendar grid and day panel.
- [x] Verify real Electron geometry at 1200×780, 1024×768, 720×640 and minimum height; page/content have no unintended overflow, action buttons remain reachable, all eight table columns remain accessible.
- [x] Verify CRUD, filter disclosure/apply/reset, keyboard escape/focus, calendar month navigation, existing unsaved guards, both themes and reduced motion.
- [x] Inspect screenshots and run appropriate existing checks.
- [x] Rebuild Windows packages and update delivery notes.

## Results — 2026-10-23

- `npm run check`: all 70 tests passed and renderer/preload built.
- Real Electron checks passed for both built resources and Vite. Geometry assertions passed on all five window sizes, including 720×540 and a six-week month: no outer workspace overflow, all eight columns fit, pagination and calendar actions stay visible.
- The smoke exercised native Escape/Tab/Shift+Tab: navigation overlays without narrowing the table, background controls are inert, focus cycles within the menu and returns to the toggle. Closing search filters preserves the draft and applied results. The scenario waits for actual popover focus before typing.
- Wide-column mode and pinned headers passed; CRUD, Excel, calendar counts, database switching and unsaved close protection passed.
- Screenshots reviewed in both themes and compact sizes. Integration review found the navigation focus issue; it was fixed with inert/focus containment and covered in real Electron.
- `npm run build:win` succeeded. Packaged application/build sources matched all 40 files, and the bundled Electron runtime passed SQLite and ExcelJS checks.
- Updated installer: `release/Work Board Setup 0.1.0.exe` (96,999,957 bytes). Updated portable: `release/Work Board 0.1.0.exe` (96,772,097 bytes).
