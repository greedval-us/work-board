# Windows 7 / 8 / 8.1 / 10, 32-bit

The user requested an x86 executable for all four Windows generations. Keep the modern Electron build and existing application data format.

- [x] Add an isolated Electron 22.3.27 packaging profile with pinned better-sqlite3 9.6.0 and an Electron ABI 110 / ia32 prebuild.
- [x] Adapt SQLite behind the existing synchronous database boundary; bundle main as CommonJS and target Node 16 / Chromium 108.
- [x] Preserve asset paths, DOCX exports and filter controls on the older runtime.
- [x] Run the unit suite, modern desktop regression, legacy desktop workflows and packaged runtime/architecture checks.
- [x] Produce the installer and portable executable; document the build commands and the limit of testing on the current Windows host.

Verified 2026-11-12:

- `npm test`: 414 passed, zero failures/skips. Windows filesystem tests required running outside the restricted sandbox.
- `npm run test:desktop`: registry and background scenarios passed on modern Electron.
- `npm run build:win:legacy -- --publish never`: installer and portable built successfully.
- `npm run test:package:legacy`: 106 packaged source/build files match; Electron 22.3.27, ia32 PE, ABI 110, native SQLite and Excel round trips pass. Portable extracted EXE/ASAR/native module hashes match the unpacked application.
- `npm run test:desktop:legacy`: exact packaged main/preload/renderer/IPC startup, full registry/export/calendar/checkpoint scenarios and background reminders passed. Each scenario uses an isolated profile. The notification adapter is injected so tests do not publish OS banners.
- `git diff --check`: clean.

Host Windows build: 10.0.26200. A separate Windows 7/8/8.1 machine was unavailable; target compatibility follows the pinned Electron 22 runtime and exercised Node 16 / Chromium 108 code paths, not a claim of testing those operating systems.
