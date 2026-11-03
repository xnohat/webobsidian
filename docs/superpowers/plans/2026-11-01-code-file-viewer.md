# Code File Viewer Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. Implementation and subsequent review records follow below.

**Goal:** Открывать исходники и текстовые файлы в WebObsidian с подсветкой, номерами строк, копированием и настройкой расширений.

**Architecture:** Встроенный React-компонент с CodeMirror 6 в режиме только чтения. Отдельное чтение кода через API, существующие вкладки и отдельное отображение в боковой панели. Не расширять API совместимости Obsidian ради одного просмотрщика.

**Tech Stack:** React 18, TypeScript, Zustand, CodeMirror 6 / language-data, Express, Zod; существующие Node test runner и Vitest.

**Spec:** Раздел «Проектное решение» этого документа.

**Дата:** 2026-11-01.

## Проектное решение

### Подходы

1. **Рекомендуется: встроенный просмотрщик на CodeMirror.** Повторяет пользовательские возможности плагина, использует текущую подсветку и темы. Сам пакет плагина не устанавливается; возможны отличия цветов и списка грамматик от Prism.
2. **Альтернатива: совместимость с оригинальным плагином.** Требует `TextFileView`, регистрации представлений/расширений, `loadPrism`, страницы настроек, DOM-методов Obsidian и управления открытыми представлениями. Имеет смысл как отдельная работа по поддержке нескольких плагинов; в этот план не входит.

Источник поведения: [README](https://github.com/qojis/obsidian-code-file-viewer/blob/main/README.md), [main.ts](https://github.com/qojis/obsidian-code-file-viewer/blob/main/main.ts). При переносе таблицы расширений зафиксировать upstream commit и лицензию в документации.

### Пользовательское поведение

- Файл открывается из дерева, представления папки, быстрого поиска, внутренней ссылки или прямого URL в обычной вкладке; поддерживается открытие сбоку.
- Панель показывает язык, «Только чтение» и кнопку копирования. Есть выделение, горизонтальная прокрутка, поиск по файлу и отключаемые номера строк.
- Настройки: включение просмотрщика, номера строк, таблица `расширение: язык`, восстановление значений по умолчанию. `plain` означает текст без подсветки.
- Предлагаемое значение по умолчанию: просмотрщик включён, номера строк включены, таблица расширений из плагина с сопоставлением имён Prism именам CodeMirror. Неизвестный язык открывается как текст с пояснением.
- **Изменение существующего поведения:** попавшие в таблицу `.js`, `.json`, `.css`, `.yaml`, `.txt`, `.csv` будут открываться только для чтения. Выключение просмотрщика или удаление соответствующей записи возвращает прежний редактор для ранее поддерживаемых текстовых форматов. Для новых форматов без записи остаётся скачивание. Отдельное редактирование кода не входит в объём.
- При изменении настроек, затрагивающем открытый редактор, сначала завершить сохранение его правок; при ошибке сохранения отменить переход. Восстановленный локальный черновик нельзя скрыть новым режимом: оставить его в прежнем редакторе до разрешения/сохранения.
- Markdown, Canvas, изображения, PDF, аудио, видео и известные бинарные вложения сохраняют собственные представления; пользовательские mappings не могут их перехватить.
- Файлы без расширения: отдельное правило для имени `Dockerfile`, без регистрации всех безымянных расширений. Скрытые файлы и каталоги остаются скрытыми по существующим правилам; показ `.env` не входит в задачу.

### Границы и значения

- `MAX_HIGHLIGHT_CHARS = 1_000_000`: при превышении показывать текст без загрузки грамматики. Это число UTF-16 code units, как в исходном плагине, а не размер в байтах.
- `MAX_CODE_FILE_BYTES = 10 * 1024 * 1024`: предложенный предел полного просмотра; более крупный файл получает пояснение и скачивание. Чтение на сервере ограничивать фактическим объёмом, а не только предварительным `stat`.
- UTF-8, с допустимым BOM; NUL или некорректный UTF-8 дают результат «неподдерживаемый текстовый формат» и скачивание. Не пытаться автоматически перекодировать UTF-16/Windows-1251 в первой версии.
- Просмотр не создаёт черновиков, не вызывает запись содержимого, не выполняет код и не передаёт его Markdown/HTML-рендереру. Это свойство просмотрщика, а не запрет других разрешённых операций с файлами через API.
- Обычный API чтения/записи, скачивание и индексация Markdown сохраняют контракты. Исходники не добавляются в полнотекстовый индекс заметок и граф.
- Настройки находятся в `ui.codeFileViewer` серверных настроек WebObsidian, глобально для установки, как другие UI-настройки. `.obsidian/plugins/.../data.json` не изменяется.

## Global Constraints

- Сохранить текущие проверки авторизации, путей и разрешённых корней vault.
- Новые зависимости для подсветки не нужны; использовать установленные CodeMirror/language-data.
- Не расширять серверный `TEXT_EXTS` и клиентский `TEXT_RE` так, чтобы просмотр автоматически разрешал редактирование новых форматов.
- Не менять API совместимости плагинов и не заявлять поддержку оригинального Code File Viewer.
- Ограничения: 1_000_000 UTF-16 code units для подсветки; 10 MiB для просмотра.
- Не выполнять deployment, публикацию или изменения пользовательского vault в рамках реализации.

## Review Focus

1. Несохранённая заметка/восстановленный черновик при переключении в просмотр кода: текст остаётся доступен при любом сбое сохранения. Проверки в задаче 3.
2. Быстрое открытие A → B, смена vault и поздний ответ API/загрузка языка: данные A не попадают в B или другой vault. Проверки в задачах 3–4.
3. Бинарный файл с текстовым расширением, Unicode, файл на границе размера и файл, растущий во время чтения: ограниченный объём чтения и предсказуемое скачивание. Проверки в задаче 2.
4. Новое расширение при `showUnsupportedFiles=false`, переключении настройки и перезагрузке: одинаковая доступность в дереве, папке и поиске. Проверки в задачах 1 и 5.
5. Исчезновение файла или отсутствие цели `[[missing.py]]`: понятное сообщение без создания файла с Markdown-содержимым. Проверки в задачах 3 и 5.

## Карта файлов

| Файлы | Ответственность |
|---|---|
| `web/src/lib/codeFiles.ts` — новый | Тип настроек, defaults, разбор mappings, разрешение языка и выбор кода для просмотра |
| `web/src/lib/media.ts`, `attachments.ts`, `suggest.ts` | Распознавание поддерживаемых форматов с явной передачей настроек |
| `server/src/services/codeFileReader.ts` — новый | Ограниченное чтение и проверка UTF-8 для просмотра |
| `server/src/routes/files.ts`, `web/src/lib/api.ts` | API чтения кода, типы ответа и настроек |
| `server/src/services/settings.ts`, `server/src/routes/settings.ts` | Defaults, валидация и сохранение `ui.codeFileViewer` |
| `web/src/lib/store.ts`, `web/src/App.tsx` | Открытие, загрузка настроек до восстановления вкладок, сохранность черновиков |
| `web/src/components/CodeFileView.tsx` — новый | Компонент просмотра с собственным жизненным циклом CodeMirror |
| `web/src/components/Workspace.tsx` | Основная/боковая панели, команды и скрытие Markdown-панелей для кода |
| `web/src/components/CodeFileViewerSettings.tsx` — новый; `Settings.tsx` | Интерфейс настройки |
| `web/src/components/FileTree.tsx`, `FolderView.tsx`, `CommandPalette.tsx` | Реактивное обновление видимости файлов |
| `web/src/lib/activeEditor.ts`, `web/src/styles/obsidian.css` | Поиск в активной панели, темы и размеры |

## Task 1: Настройки и классификация файлов

**Interfaces:** `CodeFileViewerSettings = {enabled:boolean; lineNumbers:boolean; extensionMap:Record<string,string>}`; `parseCodeMappings(text:string): {map:Record<string,string>; errors:string[]}`; `resolveCodeLanguage(path:string, settings:CodeFileViewerSettings): string|null`. `null` означает отсутствие маршрута в просмотрщик; `plain` — маршрут без подсветки. Передавать settings в классификаторы явно, без импорта store из `media.ts`.

- [ ] Добавить `web/tests/codeFiles.test.ts` и расширить `web/tests/media.test.ts`: Python/TS/PowerShell, верхний регистр, `Dockerfile`, неизвестный язык, `plain`, выключение, удаление mapping, запрет перехвата `.md/.markdown/.canvas/.pdf/.png/.zip`. Проверить нормализацию точки/регистра, комментарии, дубликаты (последняя запись побеждает), вывод номера ошибочной строки.
- [ ] Запустить `node --import tsx --test web/tests/codeFiles.test.ts web/tests/media.test.ts`; подтвердить падение новых проверок.
- [ ] Реализовать `codeFiles.ts`; нормализовать aliases Prism (`markup`, `bash`, `csharp`, `docker`) к поддерживаемым именам CodeMirror. Добавить `'code'` в `FileViewKind`; приоритет встроенных представлений сохранить.
- [ ] В `settings.ts` добавить валидацию `ui.codeFileViewer`: максимум 256 mappings, ключ/язык до 64 символов, ключи по `^[a-z0-9_+-]+$`, язык по `^[a-z0-9_+-]+$`; запрет зарезервированных форматов. Повреждённые сохранённые настройки сбрасывают только это поле; некорректный PUT возвращает 400 без записи.
- [ ] Добавить проверки defaults/PUT/миграции в `server/src/routes/settings.test.ts` и `server/src/services/settings.integration.test.ts`, включая сохранность остальных настроек. Тип UI-настроек добавить в `web/src/lib/api.ts`.
- [ ] Повторить клиентские проверки и `npm --workspace server run test -- src/routes/settings.test.ts src/services/settings.integration.test.ts`; ожидается PASS.

## Task 2: Ограниченное чтение кода

**Interfaces:** новый `GET /api/files/code-content?path=…`; `api.readCode(path:string, signal?:AbortSignal):Promise<CodeFileReadResult>`. Успешный результат: `{kind:'text'; path:string; content:string; highlightAllowed:boolean}` либо `{kind:'unavailable'; path:string; reason:'too-large'|'binary'|'encoding'}`. Авторизация/недопустимый путь/отсутствие файла — существующие HTTP-ошибки, не успешный пустой текст.

- [ ] Создать `server/src/routes/files.code.test.ts` по образцу HTTP-fixture `files.concurrency.test.ts`: UTF-8/BOM/CRLF, NUL, invalid UTF-8, 10 MiB и 10 MiB + 1, порог 1_000_000 символов, 401, 404, путь вне vault, допустимые и недопустимые symlink targets, запрос директории.
- [ ] Запустить `npm --workspace server run test -- src/routes/files.code.test.ts`; новые проверки должны падать.
- [ ] Реализовать `readCodeFile(rel:string):Promise<CodeFileReadResult>` в `codeFileReader.ts`: текущий resolver vault, чтение не более лимита + 1 байт с закрытием дескриптора при всех исходах, проверка UTF-8 и безопасный результат для бинарного файла. Отдельный service-test `codeFileReader.test.ts` проверяет рост файла/превышение лимита без неограниченного чтения.
- [ ] Подключить маршрут к существующему авторизованному files router и метод клиента с AbortSignal. Не менять существующий `/content`, raw/download и `vault.isTextFile()`.
- [ ] Выполнить `npm --workspace server run test -- src/routes/files.code.test.ts src/services/codeFileReader.test.ts src/routes/files.concurrency.test.ts`; ожидается PASS.

## Task 3: Вкладки, состояние и сохранность изменений

**Interfaces:** состояние store `codeFileViewer:CodeFileViewerSettings`, `codeFileResult:CodeFileReadResult|null`, `splitCodeFileResult:CodeFileReadResult|null`; `applyCodeFileViewerSettings(next:CodeFileViewerSettings):Promise<void>`. Существующие `openFile`, `openToSide`, `hydrate`, `setContent`, `save` сохраняют внешние сигнатуры.

- [ ] Дополнить `web/tests/store.test.ts`: открытие кода/сбоку, отсутствие `api.write` и draft-record при просмотре; быстрые открытия A → B; восстановление вкладки; смена vault; ошибка чтения; сохранение dirty Markdown перед переходом; ошибка сохранения блокирует переход; настройки не скрывают восстановленный черновик; команды редактирования и Ctrl+S не меняют код.
- [ ] Запустить `node --import tsx --test web/tests/store.test.ts`; подтвердить падение новых сценариев.
- [ ] Добавить отдельную ветку загрузки через `readCode` с защитой от устаревших ответов для основной и боковой панели. Не создавать `DocumentSession` для просмотра. Обнуление/смена vault отменяют запросы и очищают code-state.
- [ ] Разделить проверки «можно прочитать/открыть сбоку» и «можно редактировать»: сохранить `TEXT_RE` для прежней записи, использовать resolver для просмотра. Защитить `setContent` и команды от изменения активного read-only документа; не допустить цикла `save()` при dirty-state без доступного writer.
- [ ] Загрузить code-настройки до `hydrate` и deep-link открытия в `App.tsx`. При ошибке загрузки не делать автоматический переход существующего редактора в другой режим; показать ошибку и дать повторить загрузку.
- [ ] Учесть rename/move/delete, history и существующий refresh после файловых событий; обновление с диска не должно делать вкладку dirty. Добавить тест отсутствующей `[[missing.py]]`: показать отсутствие файла, не вызывать создание заметки.
- [ ] Повторить store-тесты; ожидается PASS.

## Task 4: Компонент просмотра и интеграция панелей

**Interfaces:** `CodeFileView({path,result,language,lineNumbers}: {path:string;result:CodeFileReadResult;language:string;lineNumbers:boolean})`. Настройки и результат приходят через props; компонент не делает второй запрос файла и не записывает содержимое.

- [ ] Создать `CodeFileView.tsx`: `EditorState.readOnly.of(true)`, `EditorView.editable.of(false)`, выделение/копирование, поиск, горизонтальная прокрутка, номера строк и существующая тема подсветки. Не подключать Markdown extensions/formatting.
- [ ] Загружать грамматику лениво через `LanguageDescription` и language-data. После unmount/смены path игнорировать старую загрузку; при ошибке/неизвестной грамматике оставить текст. При `highlightAllowed=false` не загружать язык.
- [ ] Показать язык, статус только чтения, копирование с обработкой отказа Clipboard API; для `unavailable` — пояснение и существующий `api.downloadUrl(path)`.
- [ ] В `Workspace.tsx` использовать компонент в основной и боковой панели вместо Markdown Preview. Скрывать Markdown toolbar и переключение режима Markdown при просмотре кода. Поиск направлять в действительно сфокусированную панель; очистка одного редактора не должна снимать другой активный редактор.
- [ ] Добавить изолированные проверки выбора языка/устаревшего результата в `web/tests/codeFileView.test.ts` для вынесенных чистых helpers. Поведение DOM/CodeMirror проверить в браузере на синтетическом vault: ввод, вставка, drag/drop текста, Ctrl+S, Ctrl+F, выделение/копирование, быстрое A → B, две панели и отказ загрузки языка.
- [ ] Проверить пустой файл, CRLF, длинную строку, Unicode, светлую/тёмную тему и узкий экран. Содержимое `<script>…</script>` отображается буквально; копирование не меняет исходный текст.
- [ ] Выполнить `node --import tsx --test web/tests/codeFileView.test.ts` и `npm --workspace web run typecheck`; ожидается PASS. Зафиксировать результаты браузерной проверки.

## Task 5: Настройки, дерево и навигация

**Interfaces:** `CodeFileViewerSettings({value,onSave}: {value:CodeFileViewerSettings;onSave:(next:CodeFileViewerSettings)=>Promise<void>})`; обновление через существующий settings API и метод store из задачи 3.

- [ ] Добавить секцию Code files в Settings: enable, line numbers, textarea mappings, сброс defaults, явное сохранение. При ошибках mappings показать строки с ошибками и ничего не сохранять. До изменения серверных настроек завершить сохранение затронутого dirty-документа; при неудаче API оставить прежние настройки и текст формы.
- [ ] Передавать актуальные settings через `displayChildren` и `isSupportedVaultFile` из дерева, FolderView, CommandPalette и suggest. Изменение настроек должно инициировать rerender всех потребителей.
- [ ] Расширить `web/tests/attachments.test.ts`, `web/tests/media.test.ts`, `web/tests/codeFiles.test.ts`: `.py` виден при `showUnsupportedFiles=false`, исчезает из поддерживаемых при удалении mapping; `.md/.pdf` не меняются. `Dockerfile` обрабатывается по имени, `.env` не появляется в дереве.
- [ ] Проверить существующую wikilink-навигацию и прямой URL для кода без добавления исходников в Markdown-индекс. При необходимости добавить точный поиск пути по текущему дереву перед fallback создания заметки; неоднозначные basename не выбирать произвольно.
- [ ] В браузере проверить сохранение настроек → открытые обе панели → перезагрузка → отключение и возврат старого редактора для `.json`; включение при наличии несохранённых правок не теряет текст.
- [ ] Выполнить `node --import tsx --test web/tests/codeFiles.test.ts web/tests/media.test.ts web/tests/attachments.test.ts web/tests/store.test.ts`; ожидается PASS.

## Task 6: Итоговая проверка и документация

- [ ] Выполнить `npm test`, `npm run typecheck`, `npm run build`. Ожидаются нулевые exit codes; существующие посторонние сбои описать отдельно, не заявлять общий PASS при их наличии.
- [ ] На синтетическом vault проверить `.py/.ts/.tsx/.sh/.ps1/.sql/.rs/.go/.yaml/.json/.log`, пользовательское расширение, Dockerfile, large/binary/invalid UTF-8. Основная и боковая панели дают одинаковый результат.
- [ ] Проверить регрессии: Markdown live/source/reading и сохранение, Canvas, PDF, медиа, скачивание, preview tabs, история переходов, восстановление workspace и блокировки. Сравнить содержимое просмотренных файлов до/после; просмотр не вызывает запросов записи и создания черновиков.
- [ ] Документировать функцию, новые defaults, изменение поведения существующих текстовых форматов, ограничения кодировок/размера и отключение в README. В `docs/PLUGIN_COMPATIBILITY.md` явно отличить встроенную функцию от поддержки оригинального плагина.
- [ ] Передать итоговый diff и результаты проверок; коммиты формировать по завершённым задачам в рамках согласованного процесса репозитория. Deployment — отдельная задача.

## Критерии готовности

Пользователь открывает файл кода из любой существующей точки навигации, видит правильный язык или понятный fallback, может искать и копировать текст. Настройки сохраняются и одинаково действуют в обеих панелях. Просмотр не пишет в файлы, не теряет черновики и не нарушает обычную работу с заметками/медиа. Все обязательные автоматические и браузерные проверки имеют записанный результат.

## Оценка

Базовый просмотр без пользовательских mappings и полной проверки навигации: прежний ориентир 1–2 рабочих дня. Полный объём этого плана, включая настройки, две панели, черновики, ошибки и регрессионные проверки: **2–4 рабочих дня**. Это инженерная оценка объёма, не обещание времени исполнения агентом.

## Execution record — 2026-11-01

Implemented the built-in CodeMirror approach in the current suitable `codex/` checkout. No dependency installation or plugin compatibility changes were needed.

Rulings: keep `fileViewKind()` compatible with existing media consumers; route code explicitly in Workspace and use settings-aware supported-file checks. Persist `ui.codeFileViewer` only when the user saves settings; absent/invalid stored values use client defaults. Existing recoverable drafts for legacy text formats retain an editor override.

Completed: configuration/parser/classification, bounded UTF-8 API, main and split state, stale response guards, rename reloads, recovery guard, read-only renderer, live file refresh, settings UI, reactive file filtering, documentation. Independent review findings (rename routing, loading state, split refresh, focusability, settings errors, memo dependencies and theme colors) were addressed.

Validation: full server suite 348 passed / 10 skipped; full web suite 465 passed; root typecheck and build passed; integration smoke including authenticated code reads, missing/escaping paths, invalid settings and unchanged source passed. Follow-up JSX/TSX/XML grammar checks passed. Browser acceptance on an isolated local vault: Python highlighting, both panels, restore after reload, split Ctrl+F, typing and Ctrl+S preserve content, Copy succeeds, settings save reports Saved and updates both views. Unknown encodings and files larger than 10 MiB require download.

Final follow-ups: JSX/TSX/XML mappings use their own grammars; an unknown configured language stays plain text. Removing a newly supported format closes its unsupported split preview rather than sending source through Markdown. The related store regression passed (35 store tests). Browser verification confirmed both matching panes refresh after an external file change.

### Pre-merge review follow-up

Independent review identified three mixed-pane regressions. Toolbar contexts now use capture generations so switching panes cancels old dialog contexts while allowing fresh commands after focus returns. The Markdown editor restores active focus ownership. Passive code refreshes preserve explicit navigation requests. Split panes show loading/download states when code results are absent or support is removed, including while the main reload is pending. New store, registry and real browser regressions first failed and then passed (47 targeted tests). Full suite and GitHub CI are rerun before merge.
