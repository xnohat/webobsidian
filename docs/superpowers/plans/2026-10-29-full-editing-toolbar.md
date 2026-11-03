# Full Editing Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if that execution method is explicitly selected. Steps use checkbox syntax for tracking.

**Goal:** Перенести все 64 команды стандартной панели Editing Toolbar и её раскрывающиеся меню, палитры, формы, режимы расположения и настройку во встроенный редактор.

**Architecture:** Нативный реестр команд CodeMirror 6, единый контекст редактора и один механизм всплытий для всех панелей. Markdown/ограниченный HTML хранятся в заметке; frontend и server share поддерживают одинаковые формы. Настройки добавляются к существующему JSON settings API.

**Tech Stack:** TypeScript, React 18, CodeMirror 6, Zustand, remark/rehype, Zod, Node >=22.12.0.

**Spec:** [Полное проектное предложение и инвентарь 64 команд](../specs/2026-10-29-full-editing-toolbar-design.md).

Статус: реализовано и опубликовано 2026-10-29. Фактические решения, проверки и ограничения: [журнал выполнения](2026-10-29-full-editing-toolbar-progress.md). Исходные checkbox ниже сохранены как текст проектного плана; выполненные рубежи отмечены в IMPLEMENTATION_PLAN.md. Изменения toolbar/color и исправление <LS_BEN> из предыдущей работы уже существуют; их сохранить. Реализация идёт последовательно в текущем проекте, изоляция — только если потребуется отделить активные параллельные правки.

## Global Constraints

- Все стандартные команды доступны через панель, включая вложенные группы; никакой подмены отсутствующих функций декоративными кнопками.
- Контекст всегда привязан к конкретному EditorView/документу; read-only проверяется непосредственно перед записью.
- Одна команда — одна операция Undo. При изменении документа после открытия формы операция отменяется.
- Поддержать top, following selection, fixed, mobile; default top + following, fixed off.
- JSON configuration version=1; глубина групп максимум 3, максимум 200 элементов на раскладку.
- Сохранять Markdown и ограниченный совместимый HTML; не разрешать произвольные CSS/JS/SVG.
- Node >=22.12.0; новых runtime зависимостей по умолчанию нет.
- Git commit/push только по явному запросу пользователя. Текущая работа — документы; не выполнять deploy при подготовке плана.
- Сохранять законченные параллельные доработки и настройки пользователя; deployment runbook хранится у оператора и не входит в upstream contribution.

## Review Focus

1. Открытая палитра и смена заметки/блокировка: никакой записи в новый или locked-документ (задачи 2–3).
2. Меню у границы окна, zoom 200%, fullscreen и мобильная клавиатура: все пункты доступны и выделение сохранено (3, 9).
3. Сложный Markdown и частичное выделение внутри HTML span: не разрушать текст, ссылки, frontmatter и code (4–6).
4. Clipboard отклонён или upload завершился в другой вкладке: не потерять текст и не вставить ссылку в чужую заметку (7).
5. Старая/повреждённая конфигурация и чужие plugin IDs: восстановить только toolbar, сохранить остальные settings, показать отчёт (9).

## Карта файлов и границы

Существующие точки интеграции:
- web/src/components/FormatToolbar.tsx — верхняя/мобильная панель.
- web/src/lib/selectionToolbar.tsx — CM tooltip панели выделения.
- web/src/components/ColorControls.tsx — палитры, переиспользование.
- web/src/lib/activeEditor.ts, editorCommands.ts — существующие команды/совместимые обёртки.
- web/src/components/Editor.tsx, CommandPalette.tsx — потребители реестра.
- web/src/components/Workspace.tsx — upload, раскладки и focus/fullscreen.
- web/src/lib/colorFormatting.ts, livePreview.ts, markdown.ts — преобразование/рендеринг.
- web/src/components/Settings.tsx, lib/api.ts, lib/store.ts — настройки UI.
- server/src/services/settings.ts, routes/settings.ts — схема и сохранение.
- server/src/services/renderhtml.ts — public share.
- web/src/styles/obsidian.css, components/Icon.tsx — стиль и существующий набор иконок.

Новые небольшие модули:
- web/src/lib/toolbar/{types,registry,context,defaults,config,importConfig}.ts.
- web/src/lib/toolbar/commands/{basic,blocks,inserts,textTools,clipboard}.ts.
- web/src/lib/toolbar/{formatBrush,formatCleanup,focusMode}.ts.
- web/src/components/toolbar/{ToolbarSurface,ToolbarPopover,ToolbarDialog,ToolbarSettings}.tsx.
- web/tests/fixtures/editingToolbarCommands.json — проверяемый инвентарь.
- Новые tests указаны в задачах. Не переносить весь livePreview.ts в новую архитектуру ради панели.

## Общие интерфейсы

Предлагаемый контракт в types.ts:

- ToolbarContext: view: EditorView; documentId: string; selection: EditorSelection; doc: Text. documentId выдаёт существующий владелец editor и меняет при смене/перезагрузке документа.
- CommandState: enabled: boolean; active: boolean | 'mixed'; reason?: string.
- CommandResult: {status:'applied'|'cancelled'|'unavailable'; reason?:string}.
- ToolbarCommand: id: string; label: string; icon: string; writesDocument: boolean; selectionPolicy: 'inline'|'lines'|'single'|'explicit'; getState(ctx): CommandState; run(ctx): Promise<CommandResult>.
- ToolbarNode: {instanceId:string; kind:'command'; commandId:string; label?:string; icon?:string} | {instanceId:string; kind:'group'; label:string; icon:string; children:ToolbarNode[]} | {instanceId:string; kind:'separator'}.
- ToolbarLayout: 'top'|'following'|'fixed'|'mobile'.
- ToolbarConfigV1: version:1; enabled:Record<ToolbarLayout,boolean>; layouts:Record<ToolbarLayout,ToolbarNode[]>; appearance:Record<ToolbarLayout,ToolbarAppearance>; colors: {text:string; background:string; recent:string[]; custom:string[]}; fixedPosition:{x:number;y:number}.
- ToolbarConfigV1 также содержит customCommands:CustomToolbarCommand[]; CustomToolbarCommand = {id:string;label:string;icon:string;prefix:string;suffix:string}. Ограничения и точная семантика literal templates заданы в spec.
- ToolbarAppearance: density:'normal'|'compact'; iconSize:16|18|20|24; showLabels:boolean; overflow:'menu'|'scroll'|'wrap'; background:string|null; foreground:string|null.
- ImportReport: config:ToolbarConfigV1; unsupportedIds:string[]; warnings:string[].

Поля appearance допускают только валидный HEX или null (theme default). Ограничения размеров/цветов/структуры проверяются клиентом и сервером. Реестр не зависит от React; формы и platform-адаптеры подключаются при регистрации команд.

## Задача 1. Зафиксировать полный инвентарь и fixtures

**Files:** создать web/tests/fixtures/editingToolbarCommands.json, web/tests/toolbarInventory.test.ts; дополнить spec.

**Interfaces:** JSON-строка {upstreamId, nativeId, group, surface, support:'native'|'platform-fallback', fixtureNames:string[]}. Отдельный список extra-команд, без включения их в число 64.

- [ ] Получить pinned settingsData/commands и необходимые helpers upstream по SHA из spec; сверить 64 уникальных ID. Прочитать реализацию 15 text tools, кисти/ластика и настройки меню; дополнить точные примеры вход/выход и расхождения с предложением.
- [ ] Записать вход/ожидаемый Markdown для каждой изменяющей команды; для UI-команд — наблюдаемый эффект. Пометить платформенные fallback и отдельные интеграции.
- [ ] Добавить тест: ровно 64 уникальных upstreamId, нет потерянных подменю, nativeId не пустые, все fixtureNames существуют. Изменение upstream master не меняет локальную матрицу.
- [ ] Выполнить node --import tsx --test web/tests/toolbarInventory.test.ts; ожидать PASS.

**Результат:** объём измерим; будущий отчёт не путает стандартную панель с произвольными установленными плагинами.

## Задача 2. Единый реестр и безопасный контекст

**Files:** создать toolbar/types.ts, registry.ts, context.ts; изменить activeEditor.ts, editorCommands.ts, FormatToolbar.tsx, Editor.tsx, CommandPalette.tsx; tests: web/tests/toolbarRegistry.test.ts.

**Interfaces:** captureContext(view:EditorView, documentId:string):ToolbarContext; isContextCurrent(ctx:ToolbarContext):boolean; getCommand(id:string):ToolbarCommand|undefined; executeCommand(id:string,ctx:ToolbarContext):Promise<CommandResult>. context.ts связывается с lifecycle Editor.tsx; при unmount регистрация снимается.

- [ ] Тестами зафиксировать: readonly блокирует writesDocument, Copy разрешён; старый документ/уничтоженный view возвращает cancelled; неизвестный ID unavailable; изменение документа после capture отменяет run.
- [ ] Запустить node --import tsx --test web/tests/toolbarRegistry.test.ts, получить ожидаемое падение нового контракта.
- [ ] Реализовать интерфейсы, обернуть существующие Bold/Italic/Code/Link/Undo/Redo; перед каждой записью повторять guard. Старые публичные функции пока оставить thin wrappers.
- [ ] Переключить существующие поверхности на реестр без изменения состава. Удалить дублирующие реализации только после перевода всех callers.
- [ ] Повторить целевой тест и существующие selectionToolbar/colorFormatting tests; ожидать PASS.

## Задача 3. Все типы всплытий и точная модель выделения

**Files:** создать ToolbarSurface.tsx, ToolbarPopover.tsx, ToolbarDialog.tsx, toolbar/defaults.ts; изменить FormatToolbar.tsx, ColorControls.tsx, selectionToolbar.tsx, obsidian.css; tests: web/tests/toolbarPopovers.test.ts.

**Interfaces:** ToolbarSurface({layout,ctx,nodes}); ToolbarPopover({anchor,open,onClose,children}); ToolbarDialog({title,ctx,onCancel,onApply,children}). Типы React props экспортируются из соответствующих файлов. Один ToolbarOverlayProvider в Workspace.tsx обслуживает все поверхности и хранит ветку instanceId + anchor + ToolbarContext. Реализация provider находится в ToolbarPopover.tsx; портал регистрируется как принадлежащий editor interaction. Открытие на другой поверхности заменяет ветку, обработчик Escape единственный.

- [ ] Создать browser-сценарии: открыть группу редактирования → пять действий; перейти в палитру из floating → selection не исчезает; открыть дочернее меню → Escape закрывает только ребёнка.
- [ ] Проверить top-menu → following-menu: старая ветка закрыта, новая одна, Escape не закрывает два уровня одновременно и не выключает fullscreen.
- [ ] Добавить проверки правого/нижнего края, двух тем, tab/arrow navigation, pointer перехода button→menu, click-outside, повторного клика, scroll и viewport resize, переноса фокуса в input.
- [ ] Запустить node --import tsx --test web/tests/toolbarPopovers.test.ts и подтвердить ожидаемые падения.
- [ ] Реализовать общий overlay/focus lifecycle по spec; элементы меню получают состояние из registry. Реализовать компактную подпанель из скриншота и split-button палитры.
- [ ] Повторить тест; ожидается PASS, включая скрытый Electron по существующему шаблону toolbarBrowser.test.ts. Проверить клавиатурой реальный UI, а не только dispatch synthetic event.

## Задача 4. Полный базовый набор и структура блоков

**Files:** создать commands/basic.ts, commands/blocks.ts; изменить editorCommands.ts; tests: web/tests/toolbarBasic.test.ts, toolbarBlocks.test.ts.

**Interfaces:** registerBasicCommands(register:(command:ToolbarCommand)=>void):void; registerBlockCommands(register:(command:ToolbarCommand)=>void):void.

- [ ] Тесты inline: bold/italic/strike/highlight/underline; пустая, обратная, mixed и multi-selection; существующие маркеры переключаются, не дублируются; Undo/Redo.
- [ ] Добавить отдельные fixtures для extra-команд tag и `%%…%%` comment: вставка/снятие, корректный source и скрытие комментария в Reading; не менять счётчик 64 стандартных команд.
- [ ] Тесты block: H1–H6/обычный текст; bullet/numbered/task/cycle/status, renumber, indent/outdent, quote; смешанные вложенные списки и выделение до начала следующей строки.
- [ ] Зафиксировать no-op/disabled для frontmatter и code там, где команда не является редактированием кода; строки вне selection неизменны.
- [ ] Выполнить node --import tsx --test web/tests/toolbarBasic.test.ts web/tests/toolbarBlocks.test.ts, получить RED; реализовать преобразования по синтаксическим границам; повторить до PASS.
- [ ] Сопоставить все покрытые ID с инвентарём; состояния active/mixed одинаковы в toolbar и context menu.

## Задача 5. Полная семантика HTML, цветов и выравнивания

**Files:** изменить colorFormatting.ts, livePreview.ts, markdown.ts, server/src/services/renderhtml.ts; создать commands/inserts.ts для sup/sub/align-части; tests: web/tests/toolbarRendering.test.ts, server/src/services/toolbar-rendering.test.ts.

**Interfaces:** registerInsertCommands(register, services:InsertServices):void; InsertServices определяется в задаче 7 и подключает UI/upload. Форматирующие sup/sub/align работают без services. Преобразования используют чистые helpers, вызываемые из registry.

- [ ] Зафиксировать round-trip fixtures u/sup/sub, #RRGGBB/#RRGGBBAA, смешанные spans, частичный сброс, left/center/right/justify с Markdown внутри; выбрать и записать единственную каноническую сериализацию alignment после проверки.
- [ ] Добавить одинаковые примеры для live/read/split/public; запрещённый style/event остаётся удалённым, <LS_BEN> остаётся видимым.
- [ ] Запустить node --import tsx --test web/tests/toolbarRendering.test.ts и npm --workspace server run test -- src/services/toolbar-rendering.test.ts; получить RED для новых возможностей.
- [ ] Расширить только точные allowlist и декораторы; дополнить ColorControls недавними/своими цветами и alpha. Не открывать произвольный style.
- [ ] Повторить оба набора до PASS; открыть fixture в Obsidian и WebObsidian при наличии приложения, иначе записать эту часть как непроверенную.

## Задача 6. Кисть и очистка форматирования

**Files:** создать formatBrush.ts, formatCleanup.ts; изменить registry/defaults и компоненты toolbar; tests: web/tests/toolbarBrush.test.ts.

**Interfaces:** captureFormat(ctx:ToolbarContext):FormatSnapshot|null; applyFormat(ctx:ToolbarContext,format:FormatSnapshot):CommandResult; clearFormatting(ctx:ToolbarContext):CommandResult. FormatOperation<T> = {kind:'set';value:T}|{kind:'clear'}|{kind:'keep'}. FormatSnapshot содержит bold/italic/strike/highlight/underline/sup/sub как FormatOperation<true>, textColor/backgroundColor как FormatOperation<string>; не ссылки/блоки. Uniform present→set, uniform absent→clear, mixed→keep. Mode: off|once|sticky.

- [ ] Тесты: один перенос, двойной клик sticky, Escape, mixed source, read-only target, смена документа; no-op при пустом источнике.
- [ ] Зафиксировать «источник Bold без Italic → цель Italic» = Bold без Italic; mixed textColor оставляет цвет цели, uniform absent color снимает цвет; sup/sub не активируются одновременно.
- [ ] Тесты ластика: partial nested spans, смешанное оформление, сохранённые URL/embed/block structure; plain text не подменяет очистку.
- [ ] Запустить node --import tsx --test web/tests/toolbarBrush.test.ts до RED; реализовать CM state и один transaction на применение; повторить до PASS.

## Задача 7. Вставка, clipboard и перемещение строк

**Files:** дополнить commands/inserts.ts; создать commands/clipboard.ts; интегрировать Workspace.tsx, Editor.tsx и имеющиеся upload/link handlers; tests: web/tests/toolbarInserts.test.ts, toolbarClipboard.test.ts.

**Interfaces:** InsertServices = {prompt(kind:'link'|'wikilink'|'embed'|'callout'|'table'|'code'|'math',ctx:ToolbarContext):Promise<InsertRequest|null>; attach(ctx:ToolbarContext):Promise<{markdown:string}|null>}. InsertRequest — discriminated union с полями соответствующей формы; результат дополнительно проверяет context перед dispatch.

- [ ] Тесты wiki/embed/external link, table, callout, hr, inline/fenced code, inline/block math; escaping квадратных скобок/pipe/backticks, таблица с корректным header separator; single-range политика.
- [ ] Тесты Cut при отказе clipboard сохраняет текст; Paste при отказе предлагает ручное поле; Copy readonly; swap строк у начала/конца и на нескольких выбранных строках.
- [ ] Тесты attach: upload error/cancel, note-relative path, переключение/редактирование/блокировка документа до завершения; Undo не удаляет файл.
- [ ] Запустить node --import tsx --test web/tests/toolbarInserts.test.ts web/tests/toolbarClipboard.test.ts до RED; реализовать через существующие API без второго upload pipeline; повторить до PASS.
- [ ] Проверить clipboard в disposable HTTP окружении с ограничениями insecure origin и в secure context.

## Задача 8. Все 15 инструментов обработки текста

**Files:** создать commands/textTools.ts; переиспользовать ToolbarDialog.tsx; tests: web/tests/toolbarTextTools.test.ts.

**Interfaces:** transformText(id:string,input:string,params:Record<string,string>):{output:string; warnings:string[]}; registerTextToolCommands(register, promptParams:(id:string,input:string)=>Promise<Record<string,string>|null>):void.

- [ ] Для каждого ID из группы text-tools добавить exact fixtures из задачи 1; отдельно CRLF, Unicode, blank lines, tabs, escaped pipes и упорядоченность dedupe.
- [ ] Зафиксировать literal start/end для extract-between, отсутствие совпадения как no-op с сообщением; Cancel и отсутствие selection ничего не меняют.
- [ ] Запустить node --import tsx --test web/tests/toolbarTextTools.test.ts до RED.
- [ ] Реализовать pure transforms, формы prefix/suffix/number/merge/extract и preview diff; Apply одной транзакцией. Plain text не исполняет HTML.
- [ ] Повторить до PASS; большой выбранный текст не блокирует интерфейс надолго: измерить 100 тысяч строк, при превышении 100 мс вынести чистое преобразование в Worker с отменой.

## Задача 9. Раскладки, настройка, импорт и fullscreen

**Files:** создать toolbar/config.ts, importConfig.ts, focusMode.ts, ToolbarSettings.tsx; изменить Settings.tsx, Workspace.tsx, api.ts, store.ts, server settings service/route; tests: web/tests/toolbarConfig.test.ts, toolbarLayouts.test.ts, существующие server settings tests.

**Interfaces:** parseToolbarConfig(input:unknown):ToolbarConfigV1; importEditingToolbar(input:unknown):ImportReport; getDefaultToolbarConfig():ToolbarConfigV1; setFocusMode(mode:'normal'|'editor'|'workspace'):Promise<void>. Настройка хранится в ui.editingToolbar; API типы и server schema меняются вместе.

- [ ] Тесты valid/old/malformed config; depth/size limits, unknown ID, duplicate instances, invalid colors/icons; сохранение остальных settings и secrets.
- [ ] Тесты keyboard reorder, Reset одной раскладки, export→import round-trip, mapping upstream групп/цветов; unknown commands disabled и явно перечислены.
- [ ] Встроить literal prefix/suffix templates в config как customCommands с уникальными ID и текстовыми полями; добавить execute/Undo/import/export тест. Зарегистрировать show/hide и toggle-top/following/fixed как extra-команды, проверить сохранение видимости после reload.
- [ ] Тесты top/following/fixed/mobile, overflow 390 px, scroll/resize/zoom, switch Source/Reading, read-only.
- [ ] Тесты focus: editor mode скрывает окружающие панели с восстановлением прежнего состояния; workspace Fullscreen API только по user action, отказ показывает CSS fallback; native Escape синхронизирует состояние; overlay portal остаётся видимым.
- [ ] Выполнить node --import tsx --test web/tests/toolbarConfig.test.ts web/tests/toolbarLayouts.test.ts и npm --workspace server run test -- src/routes/settings.test.ts src/services/settings.integration.test.ts до RED.
- [ ] Реализовать schema/settings/UI и layout adapters; не импортировать произвольный код; повторить tests до PASS.

## Задача 10. Итоговая приёмка и подготовка выпуска

**Files:** дополнить web/tests/toolbarBrowser.test.ts и inventory fixtures; обновить PRD.md, IMPLEMENTATION_PLAN.md, CHANGELOG.md только по факту выполненной работы. Локальный deployment runbook хранится у оператора.

- [ ] Проверить 64/64 ID через registry; matrix содержит test/fixture и результат каждой команды, отдельно список отличий/платформенных fallback.
- [ ] Пройти оба скриншота пользователя: каждая видимая группа и её всплытия; mouse/keyboard/touch, темы, viewport/zoom, nested меню.
- [ ] Выполнить npm run typecheck, npm test, npm run build, node scripts/integration-smoke.mjs; desktop typecheck/build через соответствующие workspace scripts. Linux-only smoke выполнять в disposable Linux окружении. Skips не называть выполненными проверками.
- [ ] Проверить representative fixtures в доступных Chromium/Edge, Firefox, Safari; записать непроверенные среды. Проверить публичную ссылку и сохранение/повторное открытие заметки.
- [ ] Провести review final diff, особенно общих файлов livePreview/Workspace/settings и параллельных изменений; закрыть существенные дефекты, повторить затронутые проверки.
- [ ] Подготовить источник/манифест сборки с включёнными законченными параллельными доработками и точной build identity.
- [ ] При переходе к выпуску следовать отдельно согласованному плану развёртывания: backup настроек/данных/старого image, deploy завершённой сборки, health/build/assets/login/settings smoke, проверить rollback. Подготовка плана не выполняет этот шаг.

## Порядок и контрольные результаты

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.

| Рубеж | Проверяемый результат |
|---|---|
| A: 1–3 | Измеримый инвентарь, общий реестр, все типы всплытий |
| B: 4–7 | Основное редактирование, формат/кисть, вставка, clipboard; все render paths |
| C: 8–9 | Расширенные text tools, раскладки, импорт и настройка |
| D: 10 | Полная матрица, regression checks и воспроизводимый выпуск |

Не оценивать готовность количеством иконок. Если команда есть, но её подменю теряет выделение или результат исчезает в Reading/share, она не завершена.

## Самопроверка плана

- [x] Оба пользовательских скриншота отражены; раскрывающиеся подпанели выделены в отдельную задачу и контракт.
- [x] Все 64 стандартных ID включены в spec; 15 text tools и дополнительные команды отделены.
- [x] Каждая область spec имеет задачу и проверяемый результат; интерфейсы названы единообразно.
- [x] Пять основных рисков сопоставлены с тестами задач.
- [x] Планирование отделено от уже выполненных изменений и будущего выпуска; исходный плагин/сторонние интеграции не обещаны как автоматически совместимые.
