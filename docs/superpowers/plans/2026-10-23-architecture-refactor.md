# Рефакторинг и подготовка Work Board к GitHub

Цель: сохранить текущие возможности, уменьшить дублирование и закрепить границы хранения,
транспорта, состояния и представления. Публикация и push в этот план не входят.

## Реализация

1. Вынести данные реестра и календаря в Setup Pinia stores. Оставить в composables
   локальные карточки, guards и жизненный цикл; сохранять запросы между маршрутами.
2. Объединить защиту чтений через request scopes и single-flight. Включать generation,
   revision и снимок запроса в ключ; исключить устаревшие ответы и лишние IPC.
3. Использовать безопасные Result envelopes на IPC, единый renderer gateway и публичные коды ошибок.
   Добавить глобальные обработчики и восстановление раздела после ошибки рендера.
4. Вынести сборку зависимостей main в `createApplicationServices`; оставить bootstrap и lifecycle в `index.js`.
5. Добавить исходную иконку и воспроизводимую генерацию ресурсов для окна и Windows-пакета.
6. Подготовить документацию, ignore-правила, Windows CI и ручной workflow сборки artifacts.

## Проверка перед интеграцией

- Тесты persistence состояния, single-flight и гонок A → B → A, generation/revision и отказа записи.
- Тесты безопасного IPC, глобальных ошибок, recovery и composition root.
- `npm run check`, затем `npm run test:desktop` с реальными main/preload/renderer.
- `npm run build:win -- --publish never`, затем `npm run test:package`.
- Проверка diff на локальные данные и секреты; проверка workflow после отправки в GitHub.

## Проверено 23 октября 2026

- `npm run check`: 126 тестов прошли; renderer и sandboxed preload собраны.
- `npm run test:desktop`: пройден реальный Electron 38.8.6 с изолированными SQLite,
  CRUD, фильтрами, Excel на 27 строк, календарём, защитой черновиков, переключением баз,
  светлой/тёмной темами, компактными окнами и анимациями.
- `npm run icons`: созданы PNG 16–1024 px, ICO и ICNS из SVG.
- Отдельно проверено изменение ресурсов x86/x64 EXE с сохранением манифеста.
- `npm run build:win -- --publish never --config.electronDist=.electron-cache`:
  собраны NSIS и portable. Использован официальный ZIP Electron 38.8.6,
  SHA-256 которого совпал с `checksums.json` установленного npm-пакета Electron.
  Этот параметр задаёт локальный кэш архива; CI использует обычную загрузку.
- `npm run test:package`: 56 файлов ASAR совпадают с исходниками/сборкой;
  упакованный Electron 38.8.6 выполняет SQLite и создаёт XLSX через ExcelJS.
  Проверена встроенная иконка приложения, установщика и portable EXE.
- GitHub YAML, закреплённые Actions, ignore-правила и `git diff --check` проверены локально.
  GitHub workflows ещё не запускались на сервере.
- Зависимости обновлены в текущих ветках Vue, Vite, PostCSS и Electron. Полный аудит:
  15 предупреждений (11 high, 4 moderate), 0 critical; без dev — 2 moderate.
  Обоснование и оставшиеся ограничения: [SECURITY.md](../../../SECURITY.md).

Commit, push и публикация релиза не выполнялись.
