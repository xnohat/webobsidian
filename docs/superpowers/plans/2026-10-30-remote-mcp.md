# Remote MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить удалённое подключение Perplexity через HTTPS, сохранив локальный stdio MCP и REST API.

**Architecture:** Общая регистрация инструментов и операции заметок, два транспорта. `/mcp` внутри существующего Express-сервера использует ключ каждого запроса и существующие scopes; TLS завершает reverse proxy.

**Tech Stack:** Node.js >=22.12.0, TypeScript, Express 4, Zod 4, существующий MCP SDK 1.32.2, Vitest и node:test, Docker.

**Spec:** [Дизайн и точные контракты](../specs/2026-10-30-remote-mcp-design.md). Статус: код реализован; результаты и оставшиеся внешние проверки приведены ниже. Решение автора плана предложено на основании запроса пользователя.

## Global Constraints

- Сохранить `node mcp-server/dist/index.js`, `npm run mcp`, `WEBOBSIDIAN_BASE_URL`, `WEBOBSIDIAN_API_KEY`.
- HTTP `/mcp` выключен по умолчанию (`WEBOBSIDIAN_MCP_ENABLED=false`), включается явно.
- Все 12 пунктов контракта дизайна обязательны для каждого этапа; никаких общих service keys для удалённых клиентов.
- Сохранить REST-ошибки/статусы, scopes, версии, очереди записи, корзину и текущие пользовательские изменения рабочего дерева.
- Реализация разрешена пользователем 2026-10-30. Настоящие credentials, public deployment и проверка Perplexity требуют доступной внешней среды.

## Review Focus

1. Новый клиент со старым stdio config, stdout без диагностического текста — тесты этапа 1.
2. Одновременные requests с read-only и write ключами, отзыв между вызовами — этап 3.
3. Русские пути, `%`, пробелы, traversal и конфликт правки между REST/stdio/HTTP — этапы 2 и 4.
4. Host/Origin за proxy, неверная версия протокола, disconnect и JSON-парсер — этап 3.
5. Чистая установка, Docker production dependencies и Electron bundle — этапы 1 и 4.

## Этап 1. Выделить библиотеку MCP без изменения stdio

Файлы: новые `mcp-server/src/server.ts`, `mcp-server/src/types.ts`, `mcp-server/src/errors.ts`, `mcp-server/test/library.mjs`; изменить `mcp-server/src/index.ts`, `client.ts`, `package.json`, `tsconfig.json`, корневой `package.json` и `package-lock.json`.

Интерфейсы:
- `AgentApi`: методы `listNotes`, `readNote`, `writeNote`, `appendNote`, `editNote`, `grepNote`, `deleteNote`, `search`, `backlinks`, `tags` с текущими аргументами и результатами; перенести типы из client.ts.
- `createAgentApiClient(options: { baseUrl: string; apiKey: string }): AgentApi`.
- `createMcpServer(api: AgentApi): McpServer`; transport подключает вызывающая сторона.
- `AgentApiError(status: number, message: string)` — общий класс без зависимости от HTTP-клиента.
- Export `@webobsidian/mcp-server/server` содержит фабрику и типы; entry point `dist/index.js` остаётся CLI.

- [ ] Добавить tests: импорт библиотеки без ключа успешен и не пишет в stdout; две фабрики с разными fake API не смешивают результаты; схемы всех 10 инструментов совпадают с текущими.
- [ ] Выполнить новый тест и убедиться, что отсутствие factory/export является причиной падения.
- [ ] Перенести регистрацию инструментов и формирование результатов в server.ts; вынести типы/ошибки. Чтение env и завершение процесса при отсутствии ключа оставить только в CLI. HTTP-клиент сохранить с теми же URL, заголовками и сериализацией.
- [ ] Включить declaration emit и package exports для server/types/errors; задать сборку mcp-server до server. Обеспечить такой же порядок для clean `typecheck` и dev (prebuild библиотеки), не полагаться на старый dist.
- [ ] `npm --workspace mcp-server run build` и `node --test mcp-server/test/library.mjs` — PASS. Старый handshake запустить с временным vault и полными scopes; отсутствие env и SKIP не засчитывать как проверку совместимости.
- [ ] Выделить изменения этапа в отдельный commit при последующей реализации; не включать чужие изменения файлов.

## Этап 2. Общие операции REST и MCP

Файлы: новые `server/src/services/agentOperations.ts`, `mcpAgentApi.ts`, `agentOperations.test.ts`; изменить `server/src/routes/agent.ts`, `server/package.json`, lockfile. Существующие `files.concurrency.test.ts`, `tasks.test.ts` — регрессионные проверки.

Интерфейсы:
- `agentOperations: AgentApi` — операции сервера с теми же результатами, используя текущие vault/search/links/noteedit/notegrep функции.
- `createScopedAgentApi(scopes: readonly Scope[]): AgentApi` — scope guard перед каждой операцией.
- Общая таблица scopes: read для listNotes/readNote/grepNote/backlinks/tags, search для search, write для writeNote/appendNote/editNote/deleteNote.
- REST переводит доменную ошибку в прежние HTTP status/body; MCP форматирует её в прежний `isError` формат. `/tasks` и `/health` сохраняются без расширения набора MCP-инструментов.

- [ ] Добавить contract tests до переноса: успешное чтение/запись, 404, `version_conflict`, `find_ambiguous`, strict version mode, append, корзина. Проверять status/body REST, content/version MCP и итоговый файл.
- [ ] Добавить scoped-adapter tests: каждый write-метод с read/search ключом возвращает ошибку 403 и не вызывает mutation; search-only ключ не может читать; write-only ключ не получает read неявно.
- [ ] Запустить новые тесты, зафиксировать ожидаемые падения отсутствующих новых интерфейсов; существующие baseline тесты должны проходить.
- [ ] Перенести алгоритмы из REST handlers в общий сервис без переписывания их семантики. REST продолжает проверять ключ через middleware. MCP adapter проверяет scopes, но не списывает второй раз rate limit.
- [ ] Сохранить все проверки путей и синхронизацию `vault.mutateFileText`, reindex и realtime; не использовать прямые записи через fs.
- [ ] `npm --workspace server test -- src/services/agentOperations.test.ts src/routes/files.concurrency.test.ts src/routes/tasks.test.ts` — PASS; повторить stdio handshake на том же временном сервере.

## Этап 3. HTTP transport и авторизация

Файлы: новые `server/src/routes/mcp.ts`, `mcp.test.ts`, `server/src/services/mcpConfig.ts`, `mcpConfig.test.ts`; изменить `server/src/index.ts`, `server/package.json`, lockfile. Использовать `server/src/middleware/apikey.ts` без изменения поведения REST.

Интерфейсы:
- `readMcpConfig(env: NodeJS.ProcessEnv): McpConfig`, содержащий `enabled`, проверенный `publicUrl`, `allowedOrigins` и `allowedHosts`.
- `createMcpRouter(config: McpConfig): Router`; фабрика без запуска listener, чтобы тестировать на временном порту.
- Новый SDK transport `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` — сверить сигнатуру установленного SDK перед написанием кода.

- [ ] Написать HTTP SDK-client tests для initialize, initialized notification, tools/list, tools/call; 401 без/с неверным/отозванным ключом; 429 по существующему лимиту. Инициализация тоже расходует одну единицу лимита.
- [ ] Добавить тесты disabled=404 без HTML, enabled GET/DELETE=405 для авторизованного клиента; неверный JSON=400, Accept/Content-Type/protocol version отклоняются по правилам SDK, лимит JSON тела 32 MiB совпадает с текущим сервером (413 при превышении).
- [ ] Добавить tests Origin: отсутствует — разрешён, public origin — разрешён, чужой — 403; поддельные Host и X-Forwarded-Host не обходят проверку. Не расширять allowlist до wildcard ради теста.
- [ ] Добавить concurrency tests: два ключа разного scope одновременно, несколько запросов в одном соединении, отзыв между вызовами. Повторный запрос без credentials не наследует предыдущие права.
- [ ] Запустить новые тесты до реализации: ожидаемый FAIL из-за отсутствующего маршрута.
- [ ] Подключить router до SPA. Аутентифицировать каждый запрос через requireApiKey(); для POST создать scoped API и отдельные server/transport, включить no-store. Обработать конфигурацию и ошибки parser без утечки заголовков/тел.
- [ ] Установить cleanup до handleRequest; проверить завершение при успехе, exception и разрыве сокета, отсутствие зависших handles/необработанных rejection. GET/DELETE не создавать transport.
- [ ] `npm --workspace server test -- src/routes/mcp.test.ts src/services/mcpConfig.test.ts` — PASS. Убедиться, что вызов MCP не делает loopback HTTP и не списывает лимит дважды.

## Этап 4. Сборка, доставка и сквозные проверки

Файлы: изменить `Dockerfile`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `scripts/smoke-test.sh`; новые `mcp-server/test/http.mjs`, `mcp-server/test/support/vault-fixture.mjs`; проверить `desktop/scripts/build.mjs` и менять только при необходимости для bundling.

- [ ] Обеспечить временный fixture: отдельные vault/data/порт, создание тестовых ключей через текущие механизмы, cleanup только своих ресурсов. HTTP suite не зависит от production credentials и не пропускается в CI.
- [ ] Прогнать одинаковые сценарии по stdio и HTTP: все 10 tools, вложенные русские пути и спецсимволы, ошибки, search и backlinks. Сравнить результаты, а не только наличие инструментов.
- [ ] Проверить общий vault: REST читает версию, HTTP изменяет, stdio пишет со старой версией и получает конфликт; конкурентные append сохраняют обе строки; `../` и symlink за пределы vault отклоняются обоими транспортами.
- [ ] Добавить env MCP в Compose, примеры в .env.example. Передавать public URL/Origins, не передавать серверу общий API-ключ. MCP runtime dependencies и `mcp-server/dist` включить в Docker; workspace symlink должен разрешаться внутри образа.
- [ ] Запустить clean install/typecheck/build из отдельного временного checkout. `npm run typecheck`, `npm run build`, `npm test`, `npm --workspace mcp-server test` — PASS; интеграционные MCP тесты действительно выполняются.
- [ ] `docker build -t webobsidian:mcp-test .`: запустить образ с временными vault/data, проверить health и HTTP MCP enabled/disabled. Затем `npm --workspace desktop run build` и запуск упакованного server bundle с временным vault — без отсутствующих модулей и побочного запуска stdio.
- [ ] В Linux CI выполнить `scripts/smoke-test.sh`; добавить отдельный обязательный HTTP MCP тест с fixture. Не ограничиваться существующим Docker build без runtime smoke.
- [ ] Проверить reverse proxy: валидный TLS, точный маршрут без redirect, сохранение авторизации и Host, отсутствие HTML login/challenge и кэширования. Выполнить запрос официальным MCP SDK-клиентом через внешний HTTPS URL.

## Этап 5. Документация и пример Perplexity

Файлы: `README.md`, `mcp-server/README.md`, `docs/AGENT_API.md`, `SECURITY.md`, `PRD.md`, `IMPLEMENTATION_PLAN.md`, `CHANGELOG.md`; новый `docs/MCP_REMOTE.md`. Исторический host-specific `docs/DEPLOYMENT.md` не превращать в инструкцию текущего пользователя; добавить ссылку на новый общий runbook.

- [ ] В README и mcp-server/README описать два транспорта, сохранив текущие локальные команды и конфиги. В AGENT_API указать различие `/api/v1` и `/mcp`, общий ключ и scopes.
- [ ] В docs/MCP_REMOTE.md поместить включение, HTTPS proxy, диагностику 401/403/404/405/429, локальный smoke, отзыв ключа и rollback. В SECURITY описать повторную проверку ключа, Host/Origin, отсутствие общего service key и запрет логирования secrets.
- [ ] PRD — контракт нового транспорта; IMPLEMENTATION_PLAN — отдельные задачи и статус; CHANGELOG — запись Added только после реализации. Снять пометки «planned» в обзорной документации лишь после проверок.
- [ ] Включить следующий пример, явно обозначив public URL примером после развёртывания:

```dotenv
WEBOBSIDIAN_MCP_ENABLED=true
WEBOBSIDIAN_MCP_PUBLIC_URL=https://notes.example.com/mcp
WEBOBSIDIAN_MCP_ALLOWED_ORIGINS=
```

  Для nginx на том же хосте: существующий TLS virtual host проксирует точный `/mcp` на `http://127.0.0.1:8787/mcp`, сохраняет `Host` и `Authorization`, устанавливает `X-Forwarded-Proto`, отключает proxy caching/buffering. HTTP_BIND=127.0.0.1 подходит только для proxy на этом хосте; в Docker-сети upstream — адрес сервиса. Для Caddy показать эквивалентный `reverse_proxy`, не подменяя URL до `/api/v1`.

- [ ] Документировать шаги Perplexity:
  1. В WebObsidian создать `perplexity` key со scopes `read,search`, сохранить показанный один раз секрет.
  2. В Perplexity Pro открыть Plugins → Add custom → Add MCP connector (старый UI: Customize → Connectors).
  3. Выбрать Remote, Name=`WebObsidian`, URL=`https://notes.example.com/mcp`.
  4. Advanced: Transport=`Streamable HTTP`, Authentication=`API Key`, Network access=`Public` при прямом HTTPS proxy. Вставить ключ WebObsidian в поле credentials; это не ключ Perplexity API.
  5. Добавить и активировать коннектор. В новом чате выбрать его и попросить: «Используя WebObsidian, найди заметки про ЭЦП и составь краткую инструкцию со ссылками на исходные заметки».
  6. Для записи создать отдельный ключ с write, обновить подключение и проверить создание одной временной заметки. read/search ключом проверить отказ записи.
  7. Отозвать тестовый ключ; следующий вызов обязан завершиться ошибкой авторизации.

- [ ] Реально проверить пункты 2–7 в аккаунте Pro. Зафиксировать дату, build SHA, успешные tools и ошибки без секретов/содержимого личных заметок. Отдельно подтвердить фактический auth header и stateless JSON-совместимость; отсутствие доступа к аккаунту обозначить как непроведённую проверку, не как PASS.
- [ ] Указать, что отдельные API-кредиты Perplexity не требуются для коннектора, но сохраняются лимиты подписки и отдельный учёт Computer. Сослаться на официальную справку из дизайна; условия перепроверить перед выпуском.
- [ ] Проверить ссылки и согласованность URL/env/команд во всех документах; `git diff --check` — PASS.

## Выпуск и откат

Вначале тестовое хранилище и read/search ключ, затем включение на целевом сервере. Готовность: пройдены пять этапов и реальный Perplexity smoke. При проблемах выставить `WEBOBSIDIAN_MCP_ENABLED=false` и перезапустить WebObsidian; `/mcp` возвращает 404, stdio и REST продолжают работу. При откате контейнера использовать прежний образ с теми же volumes; никаких миграций данных для MCP не требуется.

Проверка самого плана: каждому контракту дизайна соответствует этап; чистая сборка, Docker/Electron, общие permissions, версия заметки и реальный Perplexity smoke включены. Реализация и тесты продукта этим документом не объявляются выполненными.

## Результат выполнения — 2026-10-30

| Этап | Статус и доказательства |
|---|---|
| 1. Библиотека/stdio | Реализовано; 2 библиотечных теста и полный прежний stdio workflow в общем интеграционном тесте |
| 2. Общие операции | Реализовано; REST regression, scoped adapter, versions, strict mode, append/edit/trash проверены |
| 3. HTTP | Реализовано; config/router tests + реальный SDK client |
| 4. Сборка/доставка | Typecheck и полная сборка PASS; Desktop build и запуск bundle PASS; Docker manifests/runtime CI обновлены, локальный daemon недоступен |
| 5. Документы | README, MCP README, Agent API, PRD, Implementation Plan, SECURITY, CHANGELOG и общий HTTPS/Perplexity runbook обновлены |

Проверки: server **243 passed, 9 skipped**, web/Electron **407 passed**, HTTP/stdio/library **3 passed, 0 skipped**; отдельный запуск HTTP/stdio против Desktop server bundle **1 passed**. Typecheck, full build и diff check прошли. Независимое ревью MCP-кода не выявило существенных ошибок; замечание об отсутствии Docker runtime smoke в CI закрыто добавлением scripts/docker-mcp-smoke.sh (enabled + disabled).

Оставшиеся проверки: clean install из пустого checkout, реальное выполнение Docker runtime smoke (daemon не запущен), Linux shell smoke, public HTTPS proxy и живой Perplexity Pro. Они не объявляются выполненными. Полная сборка и тесты на Windows выполнены вне sandbox после ограничения доступа esbuild к родительской папке.

Решения при реализации: временный vault fixture встроен в test/http.mjs вместо отдельного support-файла; не добавляли дублирующий HTTP прогон в старый shell smoke, поскольку CI имеет отдельный обязательный MCP шаг. Существующую рабочую ветку и пользовательские изменения сохранили; коммитов/публикации/развёртывания нет. Обнаруженное тестом повторное декодирование percent-путей REST исправлено, иначе stdio и HTTP расходились бы на одинаковых именах файлов.

Основной операторский документ: [MCP_REMOTE.md](../../MCP_REMOTE.md).

### Внешняя приёмка — обновление 2026-10-30

Automated acceptance uses disposable HTTP/stdio MCP fixtures. Client registration and network policy must be verified separately for each installation.
