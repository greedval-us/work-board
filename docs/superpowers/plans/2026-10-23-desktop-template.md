# Desktop Template Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Запускаемый локальный шаблон Work Board с архитектурой Matrix.

**Architecture:** Main владеет SQLite и репозиториями; renderer общается с ним через
узкий preload bridge и IPC. Vue использует layouts, views, components, Pinia и composables.

**Tech Stack:** Node.js, Electron 38.1.0, Vue 3.5.18, Vite, Pinia, Router, Tailwind, Lucide, node:sqlite.

**Spec:** `docs/superpowers/specs/2026-10-23-desktop-template-design.md`.

## Global Constraints

- JavaScript, ESM и Composition API; архитектурные границы Matrix.
- Локальная SQLite в userData; без сервера и предметных функций.
- Системный Node.js >=22.13.0; sandboxed CommonJS preload.
- Выполнить в текущем проекте согласно прямому указанию пользователя «делай шаблон».

## Review Focus

- Повторный запуск сохраняет тему и не запускает миграции повторно.
- Ошибка открытия БД видима пользователю, соединение не остаётся открытым.
- Некорректный IPC и посторонний frame не получают доступ к настройкам.
- Собранный HTML, hash-маршруты и preload работают без dev-сервера.
- Отсутствие Electron bridge показывается явно, без фальшивого успеха.

### Task 1: Local storage and contracts

**Files:** `src/main/database/*`, `src/main/repositories/SettingsRepository.js`,
`src/main/services/*`, `src/shared/*`, `tests/main/*`, `tests/shared/*`.

**Interfaces:** DatabaseService({filePath}).open()/close()/getStatus(); connection только в main.
SettingsRepository(database).get()/setTheme(theme); `light`/`dark`.
Bridge: app.getInfo(), database.getStatus(), settings.get(), settings.setTheme(theme).

- [x] Написать и запустить падающие тесты хранения, повторного запуска и валидации.
- [x] Реализовать соединение, транзакционные миграции, репозиторий, ограниченный bridge.
- [x] Запустить тесты; ожидается 0 ошибок.

### Task 2: Electron composition and Vue shell

**Files:** `src/main/{index,app,preload}.js`, `src/main/ipc/*`, `src/renderer/**`,
Vite/Tailwind/PostCSS/electron-builder config, `tests/renderer/*`.

**Interfaces:** IPC использует контракты задачи 1; renderer services получают bridge через desktopApi.
App store загружает info, status, settings; setTheme сохраняет через main.

- [x] Проверить ошибки bridge и сохранения темы тестами до реализации состояния.
- [x] Собрать main lifecycle, окно, проверку sender и IPC handlers.
- [x] Создать sidebar layout, Home/Settings/Info, store и useAppearance.
- [x] Установить зависимости, выполнить `npm run check`; ожидается успешная сборка.

### Task 3: Desktop verification and documentation

**Files:** `scripts/checkDesktop.mjs`, `scripts/desktopSmoke.mjs`, `README.md`, `docs/architecture.md`.

**Interfaces:** Smoke запускает настоящее Electron-окно, изолирует userData, проверяет bridge и SQLite.

- [x] Запустить `npm run test:desktop`; ожидается успешная загрузка UI и IPC.
- [x] Проверить `npm run pack:win` и содержимое упакованного приложения.
- [x] Выполнить итоговый review и исправить существенные замечания.
- [x] Описать команды и правила расширения шаблона; обновить состояние плана.

## Результаты выполнения

- Task 1: complete — реальная SQLite, миграции, настройки и ограниченный bridge.
- Task 2: complete — Electron/Vue shell; `npm run check`: 11/11 тестов, renderer/preload собраны.
- Task 3: complete — `test:desktop` прошёл без Vite и с `--dev`; Windows NSIS и portable собраны.
- Проверено содержимое ASAR: main, shared, preload и renderer включены.
- Независимый review выявил P2 с native radio после ошибки записи. Воспроизведено
  блокировкой настоящей SQLite, исправлено управляемыми кнопками выбора темы;
  regression smoke прошёл: отказ записи → прежний выбор → успешный повтор → перезагрузка.
- Версии зависимостей сохранены по Matrix. Подпись, собственные значки,
  другие ОС и предметные функции остаются за границами согласованного шаблона.
- Изменения оставлены для просмотра в `codex/desktop-template`, без публикации.
