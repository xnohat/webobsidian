# Plugin runtime and diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить ложные ошибки загрузки при refresh и обеспечить проверяемую ограниченную поддержку web-плагинов без порчи заметок и desktop-конфигурации.

**Architecture:** Authenticated same-origin ESM factory delivery replaces browser new Function. A per-vault PluginManager owns instances, readiness, errors and cleanup. A documented shim exposes only implemented operations; plugin code/data installed by web lives in DATA_DIR.

**Tech Stack:** TypeScript, Express, React, Node vm.Script только для проверки синтаксиса, Vitest, существующие Electron browser tests. esbuild остаётся инструментом сборки, новых production-зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-30-plugin-runtime-review.md` — диагноз, findings, варианты и границы.

**Status (2026-10-30):** реализовано и проверено в изолированном окружении. [Проверки](2026-10-30-plugin-runtime-validation.md). Сервер: 283 passed / 10 skipped; web: 417 passed; MCP: 3 passed; typecheck, build и desktop build прошли. Четыре исходных плагина остаются функционально неподдерживаемыми; точные причины указаны в матрице совместимости.

**Решения при исполнении:** готовый CommonJS проверяется через конструктор vm.Script без вызова run-методов и оборачивается в ESM factory. Это сохраняет CSP и переносимость desktop-сборки без нативной runtime-зависимости esbuild. Диагностика и API проверяются в `pluginLifecycle.test.ts`, `pluginRuntimeBrowser.test.ts`, `pluginApiBrowser.test.ts`; серверные проверки хранилища, данных и установки сгруппированы в `plugins.test.ts` и тестах compiler/routes. Независимое ревью выполнено перекрёстно авторами серверной и браузерной частей: создание дополнительного reviewer-agent было недоступно из-за лимита потоков.

## Global Constraints

- Сохранять CSP основной страницы без unsafe-eval; не включать Node/Electron execution для плагинов.
- Ни один шаг не исполняет пользовательский main.js на сервере. Проверка синтаксиса/трансформация разрешена, выполнение запрещено.
- Нельзя считать onload без исключения достаточной проверкой функциональной совместимости.
- Web data/code в DATA_DIR; существующие `.obsidian/plugins` доступны для чтения, desktop data.json/community-plugins.json не изменять.
- create не перезаписывает существующий файл; modify использует CAS и возвращает конфликт.
- Рабочая копия содержит изменения других задач: не выполнять reset/clean/git add . и не включать чужие изменения в коммит.

## Review Focus

- Успешный HTTP с HTML, 401/404 и CSP дают разные причины ошибки — Task 1/4.
- Старый async onload завершается после disable/logout/vault switch — Task 2.
- Плагин пишет поверх внешнего изменения или вызывает create с существующим путём — Task 3.
- Обновление bundle прервано; источник desktop меняется во время чтения — Task 4/5.
- onload проходит, но команда/обработчик не работают; условный require ошибочно объявлен безусловно несовместимым — Task 3/6.

## Task 1: Точная диагностика и состояние в настройках

**Files:** `web/src/lib/plugins.ts`, новый `web/src/lib/plugins/diagnostics.ts`, `web/src/components/Settings.tsx`, новые `web/tests/pluginDiagnostics.test.ts`, `pluginDiagnosticsBrowser.test.ts`.

**Interfaces:** `PluginFailure={pluginId,stage:'catalog'|'fetch'|'compile'|'instantiate'|'onload'|'unload',kind:'http'|'csp'|'syntax'|'unsupported-module'|'unsupported-api'|'runtime',message,status?:number}`; `PluginState={id,enabled,state:'disabled'|'loading'|'loaded'|'failed'|'unsupported',failure?:PluginFailure}`. Не включать код, data.json или секреты в failure.

- [ ] Написать браузерную регрессию на настоящем загрузчике: strict CSP → csp/EvalError; 401 → http/status401; повреждённый JS → syntax; неизвестный require → unsupported-module; onload throw → runtime/onload. Запустить `node --import tsx --test web/tests/pluginDiagnostics*.test.ts`, увидеть RED.
- [ ] Проверять status и Content-Type до исполнения; сохранять причины в каталоге настроек, показывать одно общее уведомление с числом ошибок и переходом в Community Plugins. Ошибку получения списка не подавлять.
- [ ] В настройках различать enabled и loaded; убрать неподтверждённое обещание работоспособности большинства плагинов. Повтор ошибки после refresh остаётся виден в статусе без серии перекрывающихся toast.
- [ ] Повторить тесты до GREEN. Зафиксировать именно диагностику, не объявлять плагины совместимыми.

## Task 2: Менеджер жизненного цикла и реальная готовность

**Files:** новый `web/src/lib/plugins/manager.ts`, изменения `plugins.ts`, `App.tsx`, `Settings.tsx`; `web/tests/pluginLifecycle.test.ts` и browser test.

**Interfaces:** `PluginManager.reconcile(vaultIdentity:string, enabledIds:string[]):Promise<void>`, `stop():Promise<void>`, `getStates():PluginState[]`; per-id in-flight Promise и generation token; `Component.register(dispose:()=>void):void`, `unload():void`.

- [ ] RED: одновременный load запускает onload один раз; enable загружает, disable вызывает onunload; ошибка старта убирает интервалы/события/стили/регистрации; завершение старого onload после смены vault не добавляет экземпляр обратно.
- [ ] Дождаться восстановления дерева и workspace до layout-ready; callbacks после готовности также выполнять. Ошибка восстановления — явное failed состояние, не ложная готовность.
- [ ] Подключить реальные vault/workspace события после успешных операций/FS sync. Закрывать менеджер при logout, смене vault и уничтожении App. Не полагаться на удаление script-элемента как на остановку JavaScript.
- [ ] GREEN: `node --import tsx --test web/tests/pluginLifecycle.test.ts web/tests/pluginDiagnosticsBrowser.test.ts`.

## Task 3: Честный shim, безопасные записи и сохранение данных

**Files:** новые `web/src/lib/plugins/obsidianApi.ts`, `server/src/services/pluginData.ts`, соответствующие routes в `server/src/routes/plugins.ts`; адаптер `web/src/lib/api.ts`; server/web tests.

**Interfaces:** `UnsupportedPluginApiError(capability:string)`; `PluginDataStore.read(vaultIdentity,id):Promise<unknown|null>`, `write(vaultIdentity,id,value):Promise<void>`; auth GET/PUT `/api/plugins/:id/data` с лимитом JSON 1 MiB и атомарной записью в DATA_DIR. Значение DATA_DIR-пути из API не принимать.

- [ ] RED: create(existing) конфликтует без изменения файла; read→внешняя правка→modify конфликтует; modify без сохранённой версии отклоняется с понятным сообщением. Для version привязать read к конкретному TFile/сессии плагина, не брать последнюю глобальную версию другого читателя.
- [ ] Реализовать create через baseVersion="", read/cachedRead сохраняют version, modify применяет её и обновляет после успеха. Ошибка никогда не маскируется под успешную запись.
- [ ] RED/GREEN: loadData/saveData переживают refresh; данные разных vault/id изолированы; ошибки записи видимы; desktop data.json не меняется. Тесты traversal/symlink и параллельных сохранений.
- [ ] Исправить getMarkdownFiles, TFile/TFolder/null lookup, chainable Setting. Реализовать реально нужные базовые command/Markdown registration через существующие механизмы приложения; остальные API бросают UnsupportedPluginApiError, а не успешно ничего не делают.
- [ ] `npm --workspace server test -- src/services/pluginData.test.ts src/routes/plugins.test.ts`; `node --import tsx --test web/tests/pluginApi.test.ts`. Связанные editor/concurrency regressions также должны проходить.

## Task 4: Исполнение совместимого кода под действующим CSP

**Files:** новый `server/src/services/pluginModule.ts`, изменения services/plugins.ts, routes/plugins.ts, web manager; `server/src/services/pluginModule.test.ts`, browser tests.

**Interfaces:** `compilePluginModule(source:string):Promise<string>` — формирует ESM с default-export CommonJS factory `(module,exports,require)=>void`, проверяет синтаксис конструктором vm.Script, никогда не вызывает factory на сервере. GET `/api/plugins/:id/runtime.mjs?version=<contentHash>` возвращает JavaScript только для разрешённого установленного включённого id текущего vault.

- [ ] RED: корректный CommonJS fixture загружается через same-origin import под production CSP без eval-нарушений; 401/disabled/неизвестный id/подмена hash отказывают; синтаксическая ошибка классифицируется до instantiation.
- [ ] Сделать cache key из vault identity, id, SHA-256 source и версии wrapper. Browser URL должен различать vault и версию, чтобы module cache не подставил старый bundle после switch/update. `Cache-Control: private, no-store`; не разрешать произвольный source в HTTP input.
- [ ] Для выявления рассогласованного legacy desktop bundle сравнить manifest/source stat до/после чтения; при изменении повторить ограниченно, затем сообщить retryable ошибку. Сохранить фиксированный снимок кода на один load.
- [ ] Переключить менеджер с new Function на import factory. Удалить строковое исполнение из общего пути. Встроенный require по allowlist; неизвестный модуль — явная несовместимость. Не выдавать пустые заглушки для Node/CodeMirror.
- [x] GREEN browser integration с точными headers нового сервера. Linux Docker проверяет runtime endpoint и синтаксическую проверку без исполнения кода плагина; дополнительные production-зависимости не понадобились.
- [ ] Обновить документацию: same-origin плагины — доверенный код, а не изолированная песочница. Внутренний eval самого плагина может по-прежнему блокироваться — это отдельная способность, не ошибка wrapper.

## Task 5: Установка и обновления без побочного изменения Obsidian

**Files:** `server/src/services/plugins.ts`, `pluginData.ts`, settings types, Settings Community Plugins, `server/src/services/plugins.test.ts`.

**Interfaces:** `InstalledPlugin` дополнить `source:'desktop'|'web'`, contentVersion и web compatibility state. Новые установки идут в DATA_DIR по vault/id; desktop source только читается. При двух источниках предпочитать явно установленную web-копию, показывая источник.

- [ ] RED: ошибка каждого скачивания не меняет активную версию; релиз без CSS убирает старый CSS новой версии; data сохраняются; invalid manifest/id/несовпадение версии не активируются.
- [ ] Скачать комплект в staging, проверить status/размеры/manifest/id, затем активировать версионированную директорию через атомарно заменяемый указатель. Фиксировать installed только после успешной активации; откат не удаляет предыдущую версию.
- [ ] Для существующих desktop plugins предложить web-копию при обновлении, не писать в общий `.obsidian/plugins`. Не менять desktop enable-list. Документировать изменение места новых установок.
- [ ] GREEN: серверные failure-injection тесты и Linux smoke. Зафиксировать bounds для bundle/manifest/data; не вводить неограниченную загрузку в память.

## Task 6: Матрица совместимости и выпуск

**Files:** новый `docs/PLUGIN_COMPATIBILITY.md`, README, CHANGELOG, отчёт `docs/superpowers/plans/2026-10-30-plugin-runtime-validation.md`.

- [ ] В отдельном тестовом vault проверить точные версии четырёх обнаруженных плагинов. Исходники загружать/запускать только в тестовом окружении с синтетическими заметками и без production cookies/ключей. Сначала статический анализ; фикстура не получает Node/Electron privileges.
- [ ] Для каждого записать зависимость/ошибку и реальное действие: TOC обновляет содержимое/рендер, toolbar выполняет команду, Canvas редактирует тестовый canvas, Templater применяет тестовый шаблон. Успех onload без выполнения действия не считать поддержкой.
- [ ] Условные require не помечать безусловным отказом только по regex. CodeMirror-адаптацию, Advanced Canvas workspace internals и выполнение пользовательского JavaScript Templater оценить отдельно; до доказанной поддержки показывать конкретное ограничение, не включать unsafe-eval глобально.
- [ ] Проверить refresh, enable/disable, повторную загрузку, logout/vault switch, отсутствие повторных таймеров/toast, сохранение настроек и отсутствие изменений desktop-файлов.
- [ ] Выполнить `npm run typecheck`, `npm test`, `npm run test:mcp`, `npm run build`, `npm --workspace desktop run build`. Независимое ревью итогового diff — особенно записей заметок и доверия к плагинам.
- [x] Перед развёртыванием: отдельный Linux-контейнер, backup DATA_DIR/config, проверка текущего CSP, индекса ready и поиска синтетической заметки; автоматический rollback при регрессии.

## Порядок

1 → 2 → 3 → 4 → 5 → 6. Диагностику можно выпустить первой отдельной поставкой. Рабочую загрузку не включать до защиты записей и cleanup. Поддержка всех четырёх реальных плагинов не обещается: результатом является честная матрица и работоспособность явно поддержанных сценариев.
