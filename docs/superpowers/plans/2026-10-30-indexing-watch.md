# Indexing and File Watching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Быстрый запуск из сохранённого кеша и автоматическое восстановление актуальности индексов при внешних изменениях файлов.

**Architecture:** Единый координатор обновляет MiniSearch, ссылки, задачи и индекс файлов через очередь. Сохранённый снимок и реестр SHA-256 позволяют проверять только изменения при старте; watcher, сверка метаданных и фоновый аудит хешей обеспечивают дальнейшее обновление.

**Tech Stack:** Node >=22.12, TypeScript, MiniSearch, Chokidar 3, Express, React, Vitest. Новая БД не требуется.

**Spec:** `docs/superpowers/specs/2026-10-30-indexing-watch-design.md` — читать вместе с планом.

**Implementation record (2026-10-30):** cached startup, reconciliation and indexing lifecycle are implemented. Regression coverage is in `coordinator.test.ts`; synthetic benchmarks use `scripts/indexing-benchmark.mjs`. See `docs/INDEXING.md` for configuration and recovery.

## Global Constraints

- План предложен для реализации; текущий production не менять на этапе планирования.
- Markdown — источник истины. Не менять `.obsidian`, IndexedDB Obsidian, заметки и формат `base_version`.
- Сохранить REST, MCP stdio/HTTP, scopes, поиск и существующий `/api/reindex`.
- Сохранить `WEBOBSIDIAN_WATCH=auto|polling`, defaults polling 1000/3000 ms; новые параметры сверки 60 s, аудита 1800 s; debounce 250 ms/max 2000 ms; save 2 s/max 30 s.
- Один обработчик индексации; максимум 10 000 уникальных ожидающих путей, затем обязательная сверка. Никаких параллельных полных построений.
- Не уничтожать последнюю успешную запись при ошибке чтения. Не публиковать неполное построение. Не выдавать отсутствие готового индекса за успешный пустой поиск.
- Рабочая копия содержит изменения других задач. Перед каждой задачей проверять diff; не выполнять `git add .`, reset/clean и общие commits. При фиксации выбирать только собственные изменения/фрагменты.

## Review Focus

1. Изменение между обходом и watcher.ready, и старое чтение после нового события → последнее состояние не теряется (задача 3).
2. Одинаковый размер/mtime при новом содержимом → глубокий аудит обнаруживает расхождение (задача 4).
3. Ошибка NFS или частичный обход → предыдущие записи сохраняются, degraded вместо пустого успешного индекса (задачи 1, 4).
4. Смена vault, fallback watcher и shutdown → нет чужих результатов и живого старого наблюдателя (задача 3).
5. Нулевые результаты при старте и устаревший ответ web-запроса → статус готовности и правильное обновление UI/MCP (задача 5).

## Файлы и границы ответственности

Новые модули: `server/src/services/indexing/{types,inventory,projection,snapshot,coordinator,watcher,config}.ts`, соответствующие `*.test.ts`, `server/src/routes/indexing.ts` и тесты. `inventory` обходит файловую систему, `projection` хранит производные данные, `snapshot` сохраняет их, `coordinator` владеет жизненным циклом. Не превращать coordinator в реализацию парсера или дискового формата.

Изменяемые: `services/search.ts`, `links.ts`, `fileindex.ts`, `vault.ts`; `routes/files.ts`, `routes/search.ts`, `routes/settings.ts`, `services/agentOperations.ts`; `server/src/index.ts`; web `App.tsx`, `SearchPanel.tsx`, `Settings.tsx`, `lib/api.ts`, `lib/store.ts`. Существующие поисковые функции остаются фасадами над опубликованным состоянием, без самостоятельной ленивой пересборки.

## Task 1: Проверяемый обход и согласованные производные данные

**Files:** новые `indexing/types.ts`, `inventory.ts`, `projection.ts` и тесты; изменить `vault.ts`, `search.ts`, `links.ts`, `fileindex.ts`.

**Interfaces:**
- `FileStamp = {size:number; mtimeMs:number; ctimeMs:number; dev?:number; ino?:number}`.
- `scanInventory(root: string): Promise<InventoryScan>`; `InventoryScan` содержит `files: Map<string,FileStamp>`, `complete: boolean`, `failedPrefixes: string[]`. Полный путь root не попадает в клиентские ответы.
- `readStableNote(root: string, rel: string): Promise<ReadResult>`; union `ok` (stamp, sha256, parsed), `missing`, `retry` (код ошибки). `ParsedNote` переиспользовать из markdown.ts; hash по Buffer до UTF-8 decode.
- `IndexProjection.applyNote(rel: string, parsed: ParsedNote): void`, `remove(rel: string): void`, `applyFile(rel: string): void`, `exportState(): ProjectionState`, `static fromState(state: ProjectionState): IndexProjection`.

- [ ] Добавить failing tests: скрытые директории/node_modules не попадают ни в один индекс; разрешённые symlink работают, цикл не зацикливает, недопустимая цель не читается; ошибка readdir означает incomplete, а не пустой успех.
- [ ] Добавить tests: `ЕЦП.md`, `.markdown`, имена с `%`; один parse обновляет title/tags/tasks/links; удаление выбранного basename восстанавливает оставшийся одноимённый файл детерминированно (меньшая глубина, затем лексикографический путь).
- [ ] Запустить `npm --workspace server test -- src/services/indexing/inventory.test.ts src/services/indexing/projection.test.ts`; подтвердить ожидаемые падения новых сценариев.
- [ ] Реализовать интерфейсы и адаптеры старых API. Использовать существующие проверки allowedRoots; не расширять доступ путями watcher. Для индексируемых файлов соблюдать одинаковую политику обхода.
- [ ] Повторить тесты и `npm --workspace server test -- src/services/search.test.ts src/services/vault.test.ts`; проверить сохранение поискового синтаксиса и задач.
- [ ] Проверить diff; зафиксировать только изменения задачи, если фиксация входит в выбранный процесс.

## Task 2: Версионированный снимок и реестр хешей

**Files:** новые `indexing/snapshot.ts`, `snapshot.test.ts`; изменить `search.ts`, `server/src/config.ts`.

**Interfaces:** `loadSnapshot(identity: VaultIdentity): Promise<SnapshotPayload|null>` и `saveSnapshot(payload: SnapshotPayload): Promise<void>`. `VaultIdentity` включает canonical root и отпечаток политики; `SnapshotPayload` включает schemaVersion=1, parserVersion, identity, generation, revision, savedAt, inventory records (stamp/hash/lastReadAt/lastHashVerifiedAt), ProjectionState и lastHashAuditAt.

- [ ] Написать failing tests: roundtrip всех производных данных, включая tasks; валидный пустой vault; несовпадение identity/schema/parser → null; повреждённый/обрезанный файл → null; прерванная запись не меняет предыдущий снимок.
- [ ] Запустить `npm --workspace server test -- src/services/indexing/snapshot.test.ts`, убедиться в ожидаемом падении.
- [ ] Реализовать файл DATA_DIR/`vault-index-v1.json`, проверку формы и ссылочной согласованности записей, атомарную замену с сохранением предыдущего файла при ошибке. Не использовать старый qmd-index как готовый новый снимок.
- [ ] Повторить тесты на Windows и Linux; проверить, что кеш не содержит второй полной копии тел заметок, а restore не читает Markdown.
- [ ] Проверить diff и подготовить отдельную фиксацию задачи.

## Task 3: Координатор, очередь и жизненный цикл

**Files:** новые `indexing/coordinator.ts`, `watcher.ts`, `config.ts` и тесты; изменить `server/src/index.ts`, `routes/files.ts`, `routes/settings.ts`, `services/agentOperations.ts`, `vault.ts`.

**Interfaces:**
- `IndexCoordinator.start(root: string): Promise<void>` завершается после запуска фоновой инициализации, не после полной индексации.
- `notify(event: {root:string; paths:string[]; source:'watcher'|'web'|'agent'}): void` после успешного изменения файлов; root захватывать в момент начала операции, а не читать из изменившихся настроек после неё. События чужого активному vault root не применять; возврат к тому vault запускает сверку.
- `requestJob(mode: 'reconcile'|'rebuild'): {jobId:string}`; `waitForJob(jobId:string): Promise<void>`.
- `switchVault(root: string): Promise<void>`, `close(): Promise<void>`, `status(): IndexStatus`.
- `IndexStatus`: phase `starting|reconciling|ready|rebuilding|degraded`, available:boolean, initialScanComplete:boolean, generation:string, revision:number, watcherMode, indexedNotes, pendingPaths, errorCount, lastReconcileAt/lastHashAuditAt (ISO|null), persistenceError:boolean. initialScanComplete сбрасывается при каждом запуске/смене vault и становится true только после первой успешной сверки и обработки её очереди; не восстанавливать true из кеша. Все остальные модули импортируют этот тип из types.ts.

- [ ] Написать tests с управляемыми обещаниями: событие во время начального обхода; add→change→unlink и unlink→add; старое чтение не перезаписывает новое; более 10 000 путей вызывает сверку; дубли API/watcher не повторяют parse неизменённого содержимого.
- [ ] Добавить lifecycle tests: ENOSPC/EMFILE закрывает native и сохраняет polling handle; close закрывает именно его; смена vault во время чтения отбрасывает старую работу; shutdown не оставляет таймеров. Запись в старый vault не обновляет новый, включая путь с одинаковым именем. Существующие mutation locks не удерживать в обратном порядке с очередью индексации.
- [ ] Запустить `npm --workspace server test -- src/services/indexing/coordinator.test.ts src/services/indexing/watcher.test.ts src/services/indexing/config.test.ts`, подтвердить падения новых контрактов.
- [ ] Реализовать последовательную очередь и поколения; ранний HTTP listen; watcher.ready → сверка → очередь; single-flight jobs и отложенное сохранение. Записи снимков тоже сериализовать: более старый save не может завершиться поверх нового поколения. Явно обрабатывать исключения async event handlers.
- [ ] Перевести ВСЕ пути записи (save/create/rename/delete/copy/restore/upload, Agent API) на notify; для папок учитывать потомков. Убрать полную buildLinkGraph из каждого Agent write. Git external changes проходят через watcher/сверку.
- [ ] При смене vault закрыть старое поколение и очистить statCache; не возвращать старые данные до готовности нового. Согласовать захваченный root с существующей `withVaultMutation`, не направлять завершение старой записи в новый vault.
- [ ] Повторить новые тесты плюс `npm --workspace server test -- src/routes/files.concurrency.test.ts src/services/agentOperations.test.ts src/services/settings.integration.test.ts`.
- [ ] Проверить diff и подготовить отдельную фиксацию задачи.

## Task 4: Восстановление пропущенных событий и ошибок NAS

**Files:** `indexing/coordinator.ts`, `inventory.ts`, `config.ts`; новые `reconciliation.test.ts`; `.env.example`.

**Interfaces:** `requestJob('reconcile')` использует inventory, а внутренняя `auditHashes(): Promise<void>` перечитывает Markdown с ограничением нагрузки. Один публичный coordinator остаётся владельцем всех таймеров. Новые env: `WEBOBSIDIAN_RECONCILE_INTERVAL_MS=60000`, `WEBOBSIDIAN_HASH_AUDIT_INTERVAL_MS=1800000`; положительные целые, неверные значения отклонять при старте с понятной ошибкой.

- [ ] Написать failing tests с fake clock: без события watcher новые/изменённые/удалённые файлы сходятся после сверок; одинаковые size/mtime/ctime, другой текст обнаруживается аудитом; одинаковый hash исключает parse; изменение во время чтения повторяется.
- [ ] Написать tests: временная EACCES/EIO/недоступный root сохраняет индекс; неполный обход не удаляет записи; подтверждение удаления двумя успешными обходами >=5 s; массовое исчезновение >=50% требует повторной проверки через 30 s; восстановление запускает сверку/аудит.
- [ ] Добавить tests обслуживания MiniSearch: счётчик replace/discard переживает restart; порог `max(500, ceil(indexedNotes * 0.2))` или 24 часа с ненулевым счётчиком ставит один rebuild; успешный rebuild обнуляет счётчик, ошибка повторяется не раньше 30 минут. Оставить autoVacuum=false; счётчик включить в SnapshotPayload задачи 2.
- [ ] Запустить `npm --workspace server test -- src/services/indexing/reconciliation.test.ts`, подтвердить ожидаемые падения.
- [ ] Реализовать интервалы и retry 1/5/30 s, ограниченный debounce, пропуск перекрывающихся проходов. Продолжительные проходы уступают event loop; очередь не растёт без ограничения. Не повторять полный обход на каждое событие.
- [ ] Повторить тесты; добавить пример NFS/SMB с polling в `.env.example`, пояснить границы метаданных и периодического SHA-256 аудита.
- [ ] Проверить diff и подготовить отдельную фиксацию задачи.

## Task 5: Статус, ручное восстановление, web и MCP

**Files:** новые `routes/indexing.ts`, `routes/indexing.test.ts`; изменить `routes/search.ts`, `routes/tasks.ts`, зависимые от индекса участки `routes/files.ts`, `services/agentOperations.ts`, `services/mcpAgentApi.ts` при необходимости, `server/src/index.ts`; web `App.tsx`, `SearchPanel.tsx`, `Settings.tsx`, `lib/api.ts`, `lib/store.ts` и обработчики разрешения ссылок; новые `web/tests/indexStatus.test.ts`, `web/tests/searchRefreshBrowser.test.ts`; `mcp-server/test/http.mjs`, `library.mjs`.

**Interfaces:** session-auth GET `/api/index/status` → IndexStatus; POST `/api/index/jobs` → 202 `{jobId}`. Старый `/api/reindex` ждёт waitForJob и возвращает `{ok:true}`. WebSocket `{type:'index',status:IndexStatus}`. Поиск дополнительно возвращает `{index:IndexStatus}`; остальные существующие поля не менять.

- [ ] Написать tests auth/status/job dedup; при cold start поиск 503/`INDEX_NOT_READY`, прямое чтение работает; legacy reindex завершает ответ только после успешного задания.
- [ ] Для всех потребителей производных данных (tasks/tags/properties/backlinks/graph/resolve/attachment fallback и соответствующие MCP tools) добавить gate первой сверки и тесты: неготовность не превращается в пустой ответ/null; web не предлагает создать существующую заметку при неготовом resolve. Предварительный кеш доступен только web-поиску с явным статусом. После успешной сверки последующая деградация сохраняет данные с предупреждением; не блокировать прямое чтение известного пути.
- [ ] Написать browser tests: активный запрос автоматически показывает внешнюю ЕЦП без правки строки; новый revision сбрасывает устаревшие snippets; старый HTTP-ответ не перетирает новый запрос; reconnect обновляет статус и поиск; ошибка отображается отдельно от пустой выдачи.
- [ ] Проверить падения: `npm --workspace server test -- src/routes/indexing.test.ts`; `node --import tsx --test web/tests/indexStatus.test.ts web/tests/searchRefreshBrowser.test.ts`.
- [ ] Реализовать статус и две кнопки в существующих настройках; не добавлять отдельную страницу. Сохранять fs-события для редактора/дерева, index уведомления ограничить 250 ms. Не сбрасывать черновики пользователя при обновлении поиска.
- [ ] Для MCP/REST Agent startup reconciliation возвращать повторяемую ошибку, degraded выдачу сопровождать index статусом; добавить проверки stdio и HTTP, что агент не получает успешные «0» вместо неготового поиска.
- [ ] Повторить целевые тесты и `npm run test:mcp`; проверить совместимость read/search scopes, всех 10 tools и текущих клиентов.
- [ ] Проверить diff и подготовить отдельную фиксацию задачи.

## Task 6: Проверка нагрузки, документация и внедрение

**Files:** новый `scripts/indexing-benchmark.mjs`; обновить README, `docs/AGENT_API.md`, `docs/MCP_REMOTE.md`, CHANGELOG; новый `docs/INDEXING.md`.

- [ ] Создать воспроизводимый benchmark на временном vault: 10 000 заметок по 4 KiB + 100 по 128 KiB, ссылки/теги/задачи, без реальных заметок и бинарных тел. Записать Node/OS/хранилище, cold/warm startup, latency HTTP, RSS/heap, reads/parses, длительность сверки/аудита. Запуск: `node scripts/indexing-benchmark.mjs`.
- [ ] Подтвердить warm startup: неизменённые тела не читаются для initial reconcile, UI не ждёт full rebuild; после offline add/change/delete итог верен. Измерить отдельно restore/JSON serialize и rebuild с двумя состояниями. Не развёртывать при OOM или превышении действующих 384 MiB container/256 MiB heap; при провале сначала пересмотреть формат/построение.
- [ ] Прогнать минимум 10 циклов изменения/удаления/создания 20% синтетического vault с рестартами и обслуживанием MiniSearch. После обслуживания размеры индекса/памяти не должны расти с числом циклов при одинаковом конечном наборе документов; сохранить измерения и погрешность. Проверить, что автообслуживание не включает ранее проблемный autoVacuum.
- [ ] Выполнить `npm run typecheck`, `npm test`, `npm run test:mcp`, `npm run build`, `npm --workspace desktop run build`. Зафиксировать результаты и известные пропуски, не считать запуск команд доказательством успеха.
- [ ] В отдельном контейнере на том же NAS повторить SMB→NFS add/edit/rename/delete, массовый импорт, изменение при остановленном приложении и warm restart; проверить web и MCP. Ошибки NAS моделировать только на тестовой папке/монтаже, production mount не отключать.
- [ ] Обновить документацию: что кешируется и когда; интервалы, cold/warm запуск; stat против hash; статусы и ручное восстановление; NFS кеширование/пустая точка mount; отсутствие обещания полного повторения закрытой реализации Obsidian.
- [ ] Перед внедрением получить независимое ревью изменений с фокусом на гонки, изоляцию vault и lifecycle. Исправить существенные замечания и повторить затронутые проверки.
- [ ] При переходе к реализации/развёртыванию сохранить backup DATA_DIR и текущий image, проверить настройки, развернуть новый image, подтвердить ЕЦП через web/MCP и внешний тест. Не изменять реальные заметки для smoke test. Откат — прежний image и его кеш; новый снимок не обязателен старой версии.
- [ ] Зафиксировать фактические результаты и очистить только собственные тестовые ресурсы. Отчёт различает реализованные функции, измеренные задержки и внешние ограничения NAS.

## Порядок выполнения

1 → 2 → 3 → 4 → 5 → 6. Кеш нельзя включать в production до готовности сверки и статусов: иначе вернётся исходная проблема устаревших результатов. Рекомендуется последовательное выполнение в текущем чате: задачи тесно связаны общей моделью состояния.
