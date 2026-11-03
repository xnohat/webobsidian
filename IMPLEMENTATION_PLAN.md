# IMPLEMENTATION PLAN — WebObsidian

## Consistent English defaults — 2026-11-03

- [x] Remove Russian PDF defaults and browser-language editor fallbacks. Localize
  remaining hardcoded PDF file actions and external-change notices. Verify fresh
  startup/reset in a Russian browser, imported Russian text, and catalogue coverage.

Verification — 2026-11-03. All 521 web tests and 391 server tests passed,
along with full typecheck, production build and integration smoke. Fresh/reset
PDF controls and missing-heading notices use English in a ru-RU browser.
Explicit Russian import updates existing controls and reset restores English.
The authored Russian import file now covers all 975 catalogue entries.

## Native colors, Canvas, diagrams and language packs — 2026-11-03

- [x] Match fenced JavaScript/Python/YAML colors with lazy grammars, compact Canvas text/controls/borders, native arrowheads and capped initial zoom; add the fingerprinted Obsidian SVG favicon.
- [x] Use a shared lazy Pele 1.8.0 adapter for existing Mermaid fences across editor/preview/nested notes, preserving source actions, navigation, themes and cleanup.
- [x] Add an English UI catalogue, compatible text-file import, template download and Settings → Language, with authenticated server persistence, startup cache, migration and serialized save/reset.
- [x] Preserve literal document/custom labels, validate translation placeholders and update existing editor/PDF widgets. Include an independently authored Russian pack for manual import.
- [x] Cover code colors, Canvas geometry, diagram safety, language persistence/failure/reset and stable toolbar overflow with browser/server regressions.

Design and validation: `docs/superpowers/plans/2026-11-02-pele-diagrams.md` and `docs/superpowers/plans/2026-11-03-language-packs.md`. Public server-rendered pages, native Electron menus and third-party plugin strings remain outside the language-pack scope.

## Code viewing, Canvas and native embeds — 2026-11-01

- [x] Add a bounded UTF-8 code-file API and read-only main/split CodeMirror viewers with settings, language mappings, Find and Copy; preserve drafts and mixed-pane focus/navigation.
- [x] Keep selected Canvas groups behind contained cards and remove the redundant vault settings button.
- [x] Match task numbering/states, literal titles and vault-controlled explorer visibility.
- [x] Share scoped PDF.js controls and fragment navigation across note embeds, file/split views and public pages; preserve note/media/Canvas structure and source paths.
- [x] Bound public nested reads and require independently unlocked child publications; isolate authored web frames with opaque-origin sandboxing.
- [x] Add synthetic native-reference captures and browser/server regressions. Source validation: 380 server + 513 web tests passed, 10 platform skips; types, builds, MCP and disposable integration smoke passed.

Evidence and limits: `docs/embed-controls-audit-2026-11-01.md` and `docs/superpowers/plans/2026-11-01-code-file-viewer.md`. Bases and physical touch acceptance remain outside the verified scope.

## Ordinary URL rendering and clicks — 2026-11-01

- [x] Reproduce automatic card conversion and non-clickable bare addresses in the real Live/Reading pipeline.
- [x] Render compact URL anchors with working clicks both outside and inside the active caret range; retain ordinary links in split preview without metadata requests.
- [x] Add browser coverage using the reported standalone and inline URLs, code literals, named links and unchanged source text.
- [x] Complete full tests, web build and independent review: 345 server and 457 web tests passed, 10 server skips; web build passed. No actionable review findings.

## Formatting toolbar navigation fix — 2026-11-01

- [x] Reproduce one extra formatting toolbar per article opened in the real Workspace; separate the external-change notice key from the toolbar key.
- [x] Verify repeated navigation, single toolbar/notice/editor, Source/Live/Reading transitions and unmount in a browser regression test.
- [x] Complete full test suite, web build and independent review: 345 server and 456 web tests passed, 10 server skips. Independent review reported no actionable findings.

Fork PR validation follow-up: Linux headless Chromium initially selected a different viewport before mounting the first toolbar. The navigation fixture now sets and asserts an explicit 1440px desktop viewport through CDP and waits for the actual editor/notice/mode transitions. Exact toolbar/editor/notice counts and the duplicate-key regression assertions remain intact.

## Saved browser copy cleanup — 2026-11-01

- [x] Compare recovery copies against scoped server reads and automatically remove only exact matching snapshots.
- [x] Protect newer/same-revision rewrites, active unsaved editor copies, review dialogs and vault switches with transaction-time guards.
- [x] Group reads by file, throttle ordinary cleanup and recheck on filesystem events, focus and successful saves.
- [x] Complete full regression suite, build and independent review: 345 server and 455 web tests passed, 10 server skips; web build passed. Plan: `docs/superpowers/plans/2026-11-01-saved-draft-cleanup.md`.

## External article change indicator — 2026-11-01

- [x] Show an explicit refresh notice when the active Markdown article changes outside the browser; detect filesystem events, tab return and missed events through a visible-tab fallback.
- [x] Re-read on refresh and protect concurrent typing, document navigation and vault changes; route local edits to the existing comparison dialog.
- [x] Verify behavior in a real browser and editor, including own saves, connection failures, stale replies and browser draft preservation.
- [x] Complete full test suite, web build and independent review: 345 server tests and 454 web tests passed; 10 server tests skipped.

Implementation plan: `docs/superpowers/plans/2026-11-01-external-note-indicator.md`.

## Obsidian vault preference compatibility — 2026-10-31

- [x] Honor attachment/note destinations and link preferences, displaying effective values and their sources.
- [x] Protect attachment deletion with complete reference scans, versions, captured vault scopes and explicit confirmations.
- [x] Update resolved links and descendant shares during rename/move; retain recovery journals for interrupted changes.
- [x] Apply excluded-file policies, readable line width and explicit mobile toolbar import.
- [x] Reject dangling destination symlinks and refresh the secure Electron packaging chain with real ASAR regression coverage.
- [x] Add synthetic native-Obsidian preference fixtures, server/browser regressions and generic network-vault guidance.

Configuration, behavior and implementation details are recorded in PRD.md and
`docs/superpowers/plans/2026-10-31-vault-settings-compatibility.md`.
Existing notes and attachments are not migrated. External filesystem writers remain
outside the process mutation queue; detected conflicts preserve recovery data.

CI follow-up 2026-10-30: the fork-main PR reproduced a hidden Electron selection-pixel timing race. The fixture now isolates its profile, disables background throttling, waits for the exact viewport and measured selection coverage, then waits up to four seconds for the selected compositor frame. All original theme, width, selected-pixel, unselected-background and margin assertions remain intact; no runtime/CSS changes are involved.

The next CI run passed the complete test suite and exposed a smoke-startup race: `/healthz` was ready before the asynchronous initial index scan, so missing-file resolution correctly returned `503` rather than `404`. The smoke fixture now waits on authenticated `/api/index/status` availability and initial-scan completion before its existing resolver assertions.

## Editor indentation and folding — 2026-10-30

- [x] Add four-column tab stops, literal Tab insertion and list/selection indentation with Shift-Tab outdent.
- [x] Add clickable folding for headings and nested indentation, including individual indented code statements; preserve code text literally and stop at the enclosing fence.
- [x] Indent/outdent a folded parent together with its hidden descendants; keep folding visual and support undo.
- [x] Add fenced-code indentation guides, standard folding shortcuts and command-palette fold/unfold actions.
- [x] Verify structural boundaries, readonly protection, mixed indentation and actual Editor keyboard/click behavior in Live Preview and Source.

Progress 2026-10-30: structural unit tests and the actual React Editor browser regression passed; web typecheck passed. Full tests/build recorded in the task result.

Follow-up 2026-10-30: the original ABAP screenshot requires folding inside fenced code, not only the enclosing block. Removed the code-interior exclusion, bounded nested folds by code syntax nodes, and added independent fold/unfold clicks for both ABAP calls in Live Preview and Source. Seven structural unit tests and the browser regression passed before full verification.

Original comparison 2026-10-30: inspected installed Obsidian 1.14.5 in an isolated synthetic vault. Measurements in `tests/fixtures/rendering/obsidian-folding.json` confirm inline controls at the first non-whitespace character (no left gutter), no generic paragraph or enclosing code-fence folds, and saved fold state after reopening. Four typed spaces remain four spaces; both tabs and spaces participate in indentation folding. Web now follows those rules and saves view state in browser storage scoped by vault and path, without storing note text. Browser regressions cover document recreation, vault isolation and a deep heading restored after asynchronous hydration of a 5,000-line note.

## Draft recovery usability — 2026-10-30

- [x] Replace the persistent draft counter with an actionable unsaved-text recovery list; hide empty lists and ordinary live autosaves.
- [x] Explain browser copies and provide Review text, Download copy and Remove browser copy actions with vault-safe removal confirmation.
- [x] Explain deleted originals and require an explicit separate copy to recover their text.
- [x] Extend real-browser coverage for recovery, removal, deleted originals, normal autosaves and mobile keyboard/zoom positioning.

Progress 2026-10-30: recovery/viewport browser regressions, web typecheck, full `npm test` (288 server + 417 web passed; 10 server skips) and production build passed. Independent code review reported no actionable findings.

## Remote MCP, indexing and editor recovery integration — 2026-10-30

- [x] Integrate authenticated remote MCP alongside local stdio and scoped keys.
- [x] Integrate cached indexing, reconciliation/hash audits and automatic search refresh.
- [x] Integrate module-based plugins, draft recovery, conflict resolution and adaptive toolbar layouts.
- [x] Preserve data-safety and authentication fixes with regression coverage.

The upstream contribution retains one consolidated commit and source attribution.
Runtime sources and configuration match the reviewed integrated source tree;
upstream repository routing is applied separately in documentation and desktop metadata.
The viewport regression waits for exact expected dimensions before its unchanged zoom
and toolbar assertions, avoiding reads of the previous asynchronous layout.

## Review fixes — 2026-10-30

- [x] R1: CLI default recovery password, including old installations.
- [x] R2: preserve dirty tabs across close/rename/delete.
- [x] R3/R4/R6: no-clobber rename, transactional versions and unique temporary files.
- [x] R5: validate nested copy targets and publish complete copies.
- [x] Regression tests, builds and integration verification.

Progress 2026-10-30: all six review fixes implemented. Regression tests first reproduced default override login, dirty-tab loss, rename clobbering, concurrent CAS/append loss, nested outside-link copy, and temporary-file collisions. Independent review additionally closed Git-metadata aliases, unsupported-tab close loops, and temporary-copy exposure through watcher indexes and application Git snapshots. Final validation: 224 server tests passed / 9 Windows file-symlink skips; 388 web tests passed; all workspace and desktop typechecks, full build, desktop build, and disposable integration smoke passed. Linux-only smoke and manual browser interaction were not run.

## Upstream contribution preparation — 2026-10-29

- [x] Consolidate the reviewed community integration and preserve contributor attribution.
- [x] Restore upstream README, desktop release and contributor-routing references.
- [x] Reproduce the Windows CRLF fixture assertion failure and compare editor state before/after rendering.
- [x] Complete fresh validation and review the portability overlay for a PR to `xnohat/webobsidian:main`.

Progress 2026-10-29: the upstream contribution uses one consolidated commit directly on
upstream `c41967a`. Source provenance and contributor credits accompany the result.
Source-fork deployment and scheduled issue workflows retain their repository guards.

Validation: all workspace and desktop typechecks/builds pass; 188 server and 364 web tests
pass, with seven Windows symlink capability skips. The browser fixture assertion first failed
on a CRLF checkout and passed after correction. Disposable HTTP integration smoke passes;
the dependency guard accepts 27 copies and a fresh npm audit reports zero vulnerabilities.
Independent overlay review found no critical/important issues; historical routing was clarified.

## Live code block selection — 2026-10-29

- [x] Keep code backgrounds below the selection layer, including the active line.
- [x] Move horizontal note margins outside the content box so multiline selection stays within block edges.
- [x] Add real browser pixel checks for wrapped, empty and active code lines, unselected margins, themes and viewport widths.

The browser regression covers three themes and two viewport widths while retaining
readable line width and centering. The upstream contribution also retains the cross-platform
fixture assertion that compares the editor's source before and after rendering.

## Literal color correction and Live mode verification — 2026-10-29

- [x] Reproduce red `<LS_BEN>` and replace it with body text color across modes/themes.
- [x] Exercise the real React Editor through Source/Live/Reading and verify unchanged note text.

Progress 2026-10-29: exact multiline-backtick example compared in hidden Obsidian,
including blank paragraphs. Live now conceals delimiters and retains ordinary literal
body lines; underscore angle identifiers use body color. 188 server +363 web tests,
typecheck/build/HTTP smoke passed.

## CI and dependency vulnerability audit — 2026-10-29

Cập nhật lần cuối: 2026-10-29.

- [x] Inspect existing workflow, workspace validation commands and GitHub Actions status (enabled; latest main run passed).
- [x] Configure manual runs, read-only permissions, concurrency, timeouts and sandboxed Linux browser test prerequisites; preserve existing build, smoke and packaging checks.
- [x] Split dependency audit into a parallel blocking job; explicitly include dev dependencies and all severities, preserve the remediated-version guard, retain JSON reports on success/failure.
- [x] Local validation: actionlint 1.7.12, 27 protected dependency copies, npm audit (zero vulnerabilities), all workspace/desktop typechecks, 186 server tests +253 web tests, application/desktop builds and disposable HTTP integration smoke pass. Seven Windows symlink tests skipped. Local runtime: Windows/Node 26.3.0; Linux/Node 22, Bash runtime smoke, Docker and Linux desktop packaging require the first hosted run after push (Docker daemon unavailable locally). No hosted run of the edited workflow is claimed.

Progress log 2026-10-29: user requested CI setup and vulnerability auditing, then explicitly authorized committing/pushing only these changes and verifying hosted Actions. Initial hosted run `40871273318` passed Docker and the zero-vulnerability audit but exposed Electron 43's lazy runtime installation: npm ci leaves chrome-sandbox absent. Install the pinned runtime explicitly before configuring the sandbox, then repeat hosted verification. Publish CI and its documentation separately from unrelated editor work; production access remains out of scope.

## Full Editing Toolbar parity — planning 2026-10-29

Cập nhật lần cuối: 2026-10-29.

- [x] Document native architecture, inventory of 64 standard commands, popup subpanels and selection behavior, rendering compatibility, settings/import and release checks.
- [x] Tasks 1–3: pinned behavior fixtures, shared command registry and all overlay types.
- [x] Tasks 4–7: basic/block formatting, colors/alignment/rendering, brush/eraser, insert/clipboard.
- [x] Tasks 8–9: all 15 text tools, layouts, settings/import and focus/fullscreen.
- [x] Task 10: complete parity matrix, regression checks and review including finished parallel changes.

Design: `docs/superpowers/specs/2026-10-29-full-editing-toolbar-design.md`.
Plan: `docs/superpowers/plans/2026-10-29-full-editing-toolbar.md`.
Progress log 2026-10-29: planning requested by user; second screenshot explicitly adds popup subpanels to acceptance. Implementation subsequently completed; 188 server +359 web tests passed, with seven Windows skips. Detailed implementation record: docs/superpowers/plans/2026-10-29-full-editing-toolbar-progress.md.

## Rendering compatibility audit and implementation — 2026-10-29

Cập nhật lần cuối: 2026-10-29.

- [x] Map Live/Reading, Preview, embed, table-cell and public rendering paths; reproduce 14 groups of semantic inconsistencies with synthetic function/browser probes.
- [x] Record evidence, scope, priorities, reference requirements and an eight-stage plan in `docs/superpowers/plans/2026-10-29-rendering-parity.md`.
- [x] Implement and verify the first critical batch: code/escaping protection, inline HTML boundaries, literal identifiers, comments, heading embeds and attachment source paths.
- [x] Compare synthetic fixtures against Obsidian 1.14.5; unify web/public dialect and HTML policy; fix Reading footnotes, table formatting, nested callouts, block embeds, relative note resolution and unsafe YAML editing fallback. Record original UI evidence and source hash.
- [~] Execute the remaining compatibility plan: complete reference matrix, shared HTML policy, block targets, complex tables/frontmatter and visual parity.

Follow-up 2026-10-29: shared policy and basic block targets are implemented; extended container/heading/cycle cases and full visual acceptance remain open. Original window screenshot capture times out, so the comparison report distinguishes accessibility/semantic evidence from pixel parity. See `docs/rendering-compatibility.md`.

Background follow-up 2026-10-29: a separate hidden Obsidian 1.14.5 now supplies PNG/DOM/computed-style references without OS focus or input. Quoted/list tables (including empty columns and edit/Undo prefixes), compound heading paths and the observed six-level embed limit are implemented. Typography corrections are covered by measured-style assertions. Full visual acceptance across themes/widths and advanced container cases remain open.

Progress log 2026-10-29: user authorized implementation. Critical fixes include regression fixtures, real CodeMirror browser checks and independent review; note source remains unchanged during rendering. Detailed evidence, scope and remaining work: `docs/superpowers/plans/2026-10-29-rendering-parity-progress.md`. No deployment in this batch.

## Color and selection formatting — 2026-10-29

Cập nhật lần cuối: 2026-10-29.

- [x] FR-2: text/background palettes and reset on existing toolbars; Obsidian-compatible source and safe preview rendering.
- [x] FR-2: floating selection toolbar, selection preservation, viewport placement, Escape and read-only guards.
- [x] Verify commands, rendering, browser interactions, full tests, typecheck and build. Final run: 186 server + 205 web tests pass (7 Windows symlink skips); 48 browser assertions across desktop/mobile, typecheck, build and disposable HTTP smoke pass. Independent review findings fixed with regressions for nested spans, Markdown block prefixes and inline code.

Design/implementation: `docs/superpowers/plans/2026-10-29-color-toolbar.md`.

## Literal angle-bracket text in Live Preview — 2026-10-29

Cập nhật lần cuối: 2026-10-29.

- [x] FR-2: preserve `<LS_BEN>` as literal text in inline and standalone positions (including lists/quotes), without changing note source; retain ordinary HTML rendering.
- [x] Verify the regression in a hidden browser with the caret inside/outside the line and in Reading mode. Independent review caught nested-container recognition; all 16 browser checks pass. Final verification: 186 server + 194 web tests pass (7 Windows symlink skips), typecheck, build and temporary-vault integration smoke pass.

## Rendering dependency remediation — 2026-10-29

- [x] Investigate inherited-trust boundary and both KaTeX copies independently; reproduce six failures.
- [x] Upgrade KaTeX 0.18.10/Mermaid 12.2.0; audit low2 ->0, every severity now gated in CI.
- [x] Verify all types, 186 server/178 web tests locally, all builds, HTTP and Windows packaging/runtime.
- [x] Independent candidate review found no confirmed surviving bypass or compatibility regression.
- [x] Hidden Electron fixture verifies inline/display math, math-labelled flowchart and sequence diagram
  in live, reading and separate Preview; unsafe links/images blocked, no external requests.
- [x] Linux/Docker/MCP CI passed at `6c21cdb`: 193 server +178 web tests, 31 smoke assertions,
  zero-vulnerability audit, all builds and Linux desktop directory packaging.
  Evidence: https://github.com/macros0/webobsidian/actions/runs/40849754338 (PR #5).

Use disposable fixtures only; the production installation and real vault remain untouched.

## Moderate dependency remediation — 2026-10-29

- [x] Confirm baseline6 moderate /0 high /0 critical and investigate boundaries independently.
- [x] Reproduce encoded-scheme, query coercion, IPv6 classification and compiler CORS regressions.
- [x] Upgrade all six targets; audit moderate6 ->0 and complete KaTeX/Mermaid entries/declarations unchanged.
- [x] Types, 186 server/168 web tests locally, all builds, temporary HTTP, Windows packaging/runtime/renderer pass.
- [x] Independent candidate review found no confirmed surviving bypass or compatibility regression.
- [x] Linux/Docker/MCP CI passed at `1c12d10`: 193 server +168 web tests, 31 smoke assertions,
  moderate audit gate, builds and Linux desktop directory packaging.
  Evidence: https://github.com/macros0/webobsidian/actions/runs/40846431268 (PR #4).

Only disposable test services are started; the installed server and real vault are untouched.

## High dependency remediation — 2026-10-29

- [x] Audit baseline: 8 high / 0 critical; independent boundary and compatibility investigation.
- [x] Add bounded-collection security regression and fresh/legacy settings compatibility controls.
- [x] Upgrade parents and migrate settings defaults; audit reduced high8 ->0, critical remains0.
- [x] Verify types, 177 server/168 web tests locally, all builds, HTTP/uploads and Windows packaging/runtime.
- [x] Independent candidate review found no confirmed surviving bypass or compatibility regression.
- [x] Linux/Docker CI passed at `08188bb`: 184 server +168 web tests, 31 smoke assertions,
  MCP stdio/schema constraints, high/critical audit, HTTP controls and Linux desktop packaging.
  Evidence: https://github.com/macros0/webobsidian/actions/runs/40840116331 (PR #3).

Production and real vaults remain outside scope; lower-severity unrelated migrations are deferred.

## Critical dependency remediation — 2026-10-29

- [x] Capture npm audit baseline and investigate runtime/tooling boundaries independently.
- [x] Reproduce proxy trust and VISUAL parser defects with legitimate controls.
- [x] Upgrade supported dependency parents/transitive patches; audit critical entries reduced 9 to 0.
- [x] Verify types, regressions, Git clone/sync, all builds, Windows packaging and bundled-server startup.
- [x] Review candidate independently; reproduce and fix test Git config isolation without unsafe allowances.
- [x] Linux/Docker CI passed at `9aa361a`: 180 server + 168 web tests, 31 inherited smoke assertions,
  critical audit gate, lockfile guard, integration smoke and desktop directory packaging.
  Evidence: https://github.com/macros0/webobsidian/actions/runs/40837364949 (PR #2).

Scope excludes production installation and unrelated high/moderate dependency upgrades.

## Community integration — 2026-10-29

- [x] Create `macros0/webobsidian` and dedicated local checkout.
- [x] Merge pinned Pham and Lakyle source branches, preserving both histories.
- [x] Resolve editor, rendering, tree, state, server and documentation conflicts.
- [x] Default trash retention to zero; test new and legacy settings.
- [x] Verify build, tests and isolated HTTP integration; independent review fixes covered by tests.
- [x] Publish reviewed integration branch in PR #1; Linux CI passed all tests, smoke checks and builds.

The following source-fork records are retained for provenance. Current evidence is in
`docs/FORK_INTEGRATION.md`; deployment is outside this task.

> Track tiến độ phát triển. Tham chiếu thiết kế: [PRD.md](PRD.md).
> Quy ước: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong.
> Cập nhật file này **mỗi khi** một mục thay đổi trạng thái.

Cập nhật lần cuối: 2026-09-30 (Phase 45 — danh sách giá trị cho thuộc tính đóng: nút ▾ cạnh `status`/`priority`/… — FR-23, issue #61)

---

## Phase 17 — Review bản production: sửa lỗi UX/bảo mật/hiệu năng — FR-2/FR-3/FR-11/FR-15/NFR
- [x] M17.1 Bảng không bẻ chữ giữa từ; bảng rộng cuộn ngang trong khung riêng (live/reading, desktop + mobile)
- [x] M17.2 Rate limit login theo `CLIENT_IP_HEADER` (vd `CF-Connecting-IP`) khi peer là proxy tin cậy + unit test
- [x] M17.3 WebSocket: client tự reconnect (backoff), server heartbeat 30s, `GET /ws` không upgrade → 426
- [x] M17.4 Tasks board: cột co giãn 240–340px, nhãn "N hidden"
- [x] M17.5 Graph: fit-to-view một lần khi layout lắng, ẩn nhãn chồng nhau, footer "N nodes · M notes"
- [x] M17.6 Setting `ui.showInlineTitle` (Appearance → Show inline title)
- [x] M17.7 Recent/Bookmarks: hiện thư mục cha khi trùng tên file
- [x] M17.8 Snippet tìm kiếm bỏ cú pháp Markdown, giữ highlight (+ test); sửa line-clamp lộ dòng 3
- [x] M17.9 Trang login dùng theme cache (localStorage) — không loé nền sáng
- [x] M17.10 Mobile: bỏ `maximum-scale=1`, ô nhập 16px (chặn iOS auto-zoom)
- [x] M17.11 `/assets/*` cache `max-age=1y, immutable`

---

## Phase 16 — Build identity & deploy truthfulness — FR-9
- [x] M16.1 `/healthz` trả `{ok, version, build}` (version = package.json repo, build = git commit nhúng lúc build qua `--build-arg GIT_SHA`)
- [x] M16.2 `deploy/deploy.sh` truyền build arg + `ensure_running_image` (phát hiện container đang chạy image cũ → `--force-recreate`, fail nếu vẫn không khớp)
- [x] M16.3 Smoke test assert `build` của deployment == commit vừa deploy (chống deploy "no-op")
- [x] M16.4 `docs/DEPLOYMENT.md` mục "Which version is running, and how to verify it" (curl, docker inspect, GitHub Actions, marker trên UI)

---

## Phase 15 — Deploy pipeline (LXC 107) & CI/CD deploy-on-merge — FR-9
- [x] M15.1 Sửa healthcheck IPv4 (`127.0.0.1`) trong `docker-compose.yml` + `Dockerfile` (bug `localhost` → `::1`)
- [x] M15.2 `deploy/deploy.sh` — idempotent: sync → backup rolling → tag rollback → build → `up -d` → wait healthy → smoke → tự rollback
- [x] M15.3 `deploy/smoke.sh` — assert hành vi bản fork trên deployment đang chạy (`/auth/status` chỉ có `passwordSet`, `123456` bị từ chối khi đã có credential, login bằng password operator)
- [x] M15.4 `.github/workflows/deploy.yml` — `workflow_run` sau CI xanh cho push vào `main` + `workflow_dispatch`, concurrency, chạy trên self-hosted runner
- [x] M15.5 Self-hosted runner trong LXC 107 (labels `webobsidian-107`) + service systemd
- [x] M15.6 Migrate LXC 107 sang bản fork (replace checkout upstream, giữ nguyên vault + volume `/data`), xoá override local + prune build cache
- [x] M15.7 Kiểm chứng sau migrate: data nguyên vẹn, login thật hoạt động, container healthy, URL public phục vụ bản fork
- [x] M15.8 `docs/DEPLOYMENT.md` (layout, quy trình, runbook, backup/rollback, ghi lại lần migrate)

---

## Phase 14 — CLI Process Manager (`webo`) — FR-14
- [x] M14.1 Workspace `packages/webo` khởi tạo với TypeScript + CLI entry (`bin.ts`)
- [x] M14.2 Server graceful shutdown: thêm handler SIGTERM/SIGINT trong `server/src/index.ts` giải phóng HTTP, WebSocket, file watcher, và autosync
- [x] M14.3 Implementing `webo` subcommands: `install`, `start`, `stop`, `restart`, `status`, `logs`, `config`, `uninstall`
- [x] M14.4 Setup PID file (`~/.webobsidian/webo.pid`), log file (`webo.log`), và scaffold configuration (`~/.webobsidian/.env`)
- [x] M14.5 Root package scripts (`npm run webo`) & documentation trong README.md / PRD.md / CHANGELOG.md
Cập nhật lần cuối: 2026-10-16 (issue #36 reveal active file in explorer; floating document outline #32; manual file/folder sorting kéo-thả theo thư mục #34; ẩn thư mục attachments trong tree; local attachment folders + nút xoá ảnh #30; trash retention; fix hanging indent list/task #20; nút xoá nhanh trong file tree + confirm trong app; double-click inline rename #19; trước đó: hanging indent list/task/ordered; multi-cursor #10; link preview card #7)

---

## Phase 0 — Foundation & scaffolding
- [x] M0.1 Khởi tạo monorepo (root `package.json` + workspaces)
- [x] M0.2 Server scaffold: Express + TS, `tsconfig`, dev script (tsx), build (tsc)
- [x] M0.3 Web scaffold: Vite + React + TS
- [x] M0.4 Cấu trúc thư mục theo PRD §2.2
- [x] M0.5 `.gitignore`, `.env.example` (ESLint/Prettier: để sau, không chặn build)

## Phase 1 — Settings store (JSON db) — FR-5
- [x] M1.1 Module `settings` đọc/ghi `data/settings.json` (atomic write + backup)
- [x] M1.2 Schema validate bằng zod, default settings, migration `version`
- [x] M1.3 Route `GET/PUT /api/settings`

## Phase 2 — Auth gate — FR-3
- [x] M2.1 Hash password (scrypt), JWT secret tự sinh
- [x] M2.2 `POST /auth/setup`, `/auth/login`, `/auth/logout`, `GET /auth/me`
- [x] M2.3 Middleware auth guard (httpOnly cookie), bảo vệ route
- [x] M2.4 First-run setup flow (UI + env seed `WEBOBSIDIAN_PASSWORD`)
- [x] M2.5 Pass mặc định 123456 + đổi mật khẩu (Settings→Account) + override khôi phục (`auth.passwordHash`/`WEBOBSIDIAN_PASSWORD`); migration pass cũ → `userPasswordHash`

## Phase 3 — Vault filesystem — FR-1
- [x] M3.1 Service vault: list tree, read, write, create, rename/move, delete→trash
- [x] M3.2 Path traversal guard + allowedRoots
- [x] M3.7 Symlink vault roots: walks của `listTree`/`copy`/`listMarkdownFiles`/`buildFileIndex` theo symlink
      (folder/file, kể cả trỏ ra ngoài vault root nếu realpath trong allowedRoots; link hỏng bỏ qua), cycle
      guard bằng `realpath`; `assertRealpathInVault` kiểm tra đa allowedRoots; `fs.cp` bật `dereference: true`
- [x] M3.3 Upload attachments (binary), serve binary với mime
- [x] M3.4 Folder browser an toàn để chọn vault path
- [x] M3.5 Filesystem watcher (chokidar) → events qua WebSocket
- [x] M3.6 Trash UI + chế độ xoá (FR-1): `vault.deleteMode` (trash/permanent) + Settings selector;
      service `listTrash/restoreFromTrash/deleteFromTrash/emptyTrash/remove`; routes `/api/files/trash*`;
      modal TrashView (Restore / xoá vĩnh viễn / Empty trash) mở từ header Files + command palette

## Phase 4 — QMD Search engine — FR-7
- [x] M4.1 Module QMD trên MiniSearch: index content/title/headings/tags/path/frontmatter
- [x] M4.2 Build index lúc khởi động + persist `data/qmd-index.json`
- [x] M4.3 Incremental update qua watcher + sau mỗi write
- [x] M4.4 Query: full-text, prefix, fuzzy, fielded (`tag:`,`path:`,`title:`)
- [x] M4.5 Route `GET /api/search`

## Phase 5 — Links graph — FR-2
- [x] M5.1 Parser wikilinks/embeds/tags → link index
- [x] M5.2 Backlinks `GET /api/backlinks`
- [x] M5.3 Graph data endpoint `GET /api/graph`

## Phase 6 — GitHub sync — FR-4
- [x] M6.1 Service git (simple-git): init/clone, status, pull, commit, push
- [x] M6.2 Git LFS: detect, `.gitattributes`, track patterns (verified lfsAvailable)
- [x] M6.3 Auth bằng PAT nhúng remote URL
- [x] M6.4 Auto-sync interval (service autosync)
- [x] M6.5 Conflict detection cơ bản + báo người dùng
- [x] M6.6 Routes `/api/git/{status,init,clone,pull,commit,push,sync}`

## Phase 7 — API Gate (Agent) — FR-6
- [x] M7.1 API key model: tạo/list/revoke, hash lưu trong settings, scopes
- [x] M7.2 Middleware apikey guard + scope check + rate limit + audit log
- [x] M7.3 `/api/v1`: notes list/read/write/append/delete, search, backlinks, tags
- [x] M7.4 Route quản lý key `GET/POST/DELETE /api/keys`
- [x] M7.5 Tài liệu agent API (`docs/AGENT_API.md`)

## Phase 8 — Community plugins — FR-8
- [x] M8.1 Đọc `.obsidian/plugins/*` (manifest + main.js)
- [x] M8.2 Obsidian API shim (App, Vault, Workspace, Plugin, Notice, Setting…)
- [x] M8.3 Plugin loader (eval main.js) + enable/disable
- [x] M8.4 Browse + install từ community (GitHub releases)

## Phase 9 — Web frontend — FR-2
- [x] M9.1 API client + auth flow + app shell (ribbon/sidebar/tabs/statusbar)
- [x] M9.2 File tree (context menu CRUD, new note/folder)
- [x] M9.3 CodeMirror 6 editor (markdown, keymap, autosave)
- [x] M9.4 Reading view (remark/rehype, wikilinks, embeds, callouts, tasks, properties)
- [x] M9.5 Search panel + command palette
- [x] M9.6 Backlinks/outline/tags panels
- [x] M9.7 Graph view (mở trong tab + panel Filters kiểu Obsidian)
- [x] M9.8 Settings UI (vault/git/api keys/plugins/theme)
- [x] M9.9 Theme Obsidian-like (dark/light)
- [x] M9.10 Navigation back/forward (toolbar ←/→ trên mọi view, history stack)
- [x] M9.11 Search: filter/sort (match case, collapse, more context, sort) + sticky query box
- [x] M9.12 Preview tabs: reuse one italicized tab while browsing; double-click or edit to keep open;
      preserve permanent tabs and workspace state, and verify navigation and rapid note selection.

## Phase 10 — Docker & docs — FR-9
- [x] M10.1 Multi-stage `Dockerfile` (web build → server runtime, git+git-lfs)
- [x] M10.2 `docker-compose.yml` (vault + data volumes, env secrets, healthcheck)
- [x] M10.3 `README.md` quickstart + `docs/AGENT_API.md`
- [x] M10.4 Deploy hardening cho self-host: compose `.env`-driven (`VAULT_HOST_PATH`,
  `HTTP_BIND/HTTP_PORT`, `WEBOBSIDIAN_WATCH`) → không clobber khi redeploy; watcher tự
  fallback polling khi inotify `ENOSPC/EMFILE`; `start_period=90s`; README mục Deploy-to-VPS

## Phase 11 — QA & DoD
- [x] M11.1 Smoke test end-to-end (login → edit → search → backlinks → agent API CRUD)
- [x] M11.2 Seed vault mẫu để demo (`sample-vault/`)
- [x] M11.3 Kiểm tra Definition of Done (PRD §8) — verified qua curl + screenshot UI

## Phase 12 — Parity & UI fidelity (đợt 2)
- [x] M12.1 Live Preview WYSIWYG (CM6): ẩn dấu định dạng, scale heading, widget wikilink/checkbox/ảnh
- [x] M12.2 Frontmatter → Properties block trong cả Live preview (StateField) lẫn Reading
- [x] M12.3 Embeds/transclusion `![[note]]` + ảnh `![[img]]` trong Reading
- [x] M12.3b Embed audio/video `![[clip.mp4]]`/`![[song.mp3]]` → `<video>`/`<audio>` HTML5 (Live Preview `MediaWidget`, Reading `markdown.ts`, public share `renderhtml.ts`) + mở thẳng file media trong tree → player; binary serve qua HTTP Range (206) cho seek; MIME/extension gom về `services/mime.ts` & `lib/media.ts`
- [x] M12.4 Context menu chuột phải thật (new/rename/delete/open-to-side/bookmark)
- [x] M12.5 Kéo-thả di chuyển file trong tree + dán/drop ảnh → upload attachments + chèn embed
- [x] M12.6 Quick switcher (⌘O) + command palette commands + hotkeys (⌘P/⌘O/⌘N/⌘E/⌘⇧F/⌘\\/⌘S)
- [x] M12.7 Bookmarks + Recent panel; Daily note command; split pane (open to the right)
- [x] M12.8 Git auto-commit-on-save (debounced) + toggle trong Settings
- [x] M12.9 Code-split bundle (react/codemirror/markdown chunks)

## Phase 13 — Obsidian look & feel (theo phản hồi người dùng)
- [x] M13.1 Bộ icon Lucide flat (component `Icon`) thay toàn bộ emoji
- [x] M13.2 Theme mặc định = Light (đúng Obsidian), palette/spacing/borders bám Obsidian
- [x] M13.3 File tree chỉ chevron (markdown không icon), active highlight tinh tế
- [x] M13.4 Vault footer (tên vault + settings); status bar nhỏ góc phải
- [x] M13.5 Right sidebar "Linked mentions" + "Outline" giống ảnh tham chiếu
- [x] M13.6 Tab bar có toggle sidebar trái/phải + nút new tab

## Phase 14 — WYSIWYG editor & context menus (theo phản hồi người dùng)
- [x] M14.1 Live Preview render đúng kiểu Obsidian: heading sạch (ẩn `#`), bold→đậm,
      italic→nghiêng, `code`→nền mono, strikethrough, bullet→•, tag→pill
- [x] M14.2 Lộ raw syntax **theo từng token tại con trỏ** (không lộ cả đoạn) — soạn thảo mượt
- [x] M14.3 Sửa lỗi áp theme tối (oneDark) lên giao diện sáng → highlight theo theme
- [x] M14.4 Callout/blockquote render inline trong Live Preview
- [x] M14.5 Frontmatter → Properties widget (block) trong Live Preview
- [x] M14.6 Menu chuột phải editor: Format/Paragraph/Insert (submenu) + Cut/Copy/Paste/Select all + Search
- [x] M14.7 Menu chuột phải file tree mở rộng: Open/Open to right/Bookmark/Make a copy/Rename/Move/Copy path/Delete
- [x] M14.8 Menu chuột phải reading view: Copy/Search/Select all; ContextMenu hỗ trợ submenu + icon

### Còn lại / cải tiến tương lai (không chặn)
- [ ] Resolve conflict UI nâng cao cho git
- [ ] Lazy-load cây thư mục cực lớn; canvas/whiteboard
- [ ] ESLint/Prettier CI; live-preview render bảng/danh sách lồng sâu nhiều cấp
- [ ] Graph: port d3-force simulation sang web worker (như Obsidian app chạy worker + WASM)
      để UI không khựng lúc graph 5.9k node đang "nở" — physics/render đã parity, chỉ còn
      kiến trúc thread (xem sim.js trong obsidian.asar; web giữ nguyên tham số, chỉ chuyển chỗ chạy)

---

## Phase 15 — Persist & sync workspace state (theo yêu cầu người dùng)
- [x] M15.1 Lưu UI/workspace state **xuống file server** `data/uistate.json` (không dùng localStorage)
      — tab đang mở, note active, viewMode, folder mở, split, recent, bookmarks, layout panel
- [x] M15.2 Khôi phục state khi load (F5 không mất note; mở trình duyệt/thiết bị khác vẫn giữ)
- [x] M15.3 **Sync real-time** giữa các tab/thiết bị qua WebSocket: tab này đổi → broadcast →
      tab kia apply (bỏ echo theo `originId`, lưu nội dung đang sửa trước khi chuyển, re-hydrate)
- [x] M15.4 Click-to-edit heading 1 lần (posAtCoords precise=false); heading bỏ underline

## Phase 16 — Deep-link URL & Public share — FR-10 (theo yêu cầu người dùng)
- [x] M16.1 URL `/note/<path>` đồng bộ với note đang mở (pushState/popstate, mở deep-link sau login,
      Graph = `/graph`)
- [x] M16.2 Server: service `shares` (`data/shares.json`, atomic write) + routes `/api/shares`
      (list/create/toggle/delete, auth) + `/public/shares/:id{,/file}` (không auth, guard chỉ
      serve file note đó nhúng, không serve `.md`)
- [x] M16.3 Trang public `/share/<token>` readonly (render Reading view, không cần login)
- [x] M16.4 UI: context menu note "Copy public link"; Settings → tab "Sharing" quản lý tập trung
      (search, toggle enable/disable nhanh, copy link, xoá)
- [x] M16.5 Password tuỳ chọn cho từng share: đặt/xoá ở tab Sharing (scrypt hash, chỉ trả
      `hasPassword`); public 401 `{passwordRequired}` → form nhập password → unlock JWT cookie
      (httpOnly, scope `/public/shares/{id}`, 12h)
- [x] M16.6 SSR trang `/share/{id}`: server render HTML hoàn chỉnh (Google indexable) + SEO meta
      (title, description, canonical, Open Graph + og:image, Twitter card); locked → form password
      noindex; thay thế trang React /share (web bỏ PublicNote, dev proxy /share về server)
- [x] M16.7 Share dialog per-note + badge (theo phản hồi, PRD 0.7): menu "Share…" (file tree +
      menu ⋯ pane, thay "Copy public link") mở popup tạo link/copy URL/toggle bật-tắt/password/xoá;
      icon globe màu accent cạnh tên note đang share trong file tree; shares cache trong store
      dùng chung cho dialog + Settings → Sharing + badge

## Phase 17 — Pane menu (⋯) & Right sidebar tabs (theo phản hồi người dùng, PRD 0.3)
- [x] M17.1 Menu "More options" (⋯) trên view-header mọi pane: note (Split right/down, Bookmark,
      Copy public link, Make a copy, Rename/Move/Copy path/Delete, Close tab/Close others),
      Graph (Copy screenshot PNG → clipboard, Close tab)
- [x] M17.2 Split pane 2 hướng: right + down (persist `splitDirection` trong uistate)
- [x] M17.3 Right sidebar tab strip icon (Backlinks · Outgoing links · Tags · Outline),
      persist tab đang chọn (`rightPanel`)
- [x] M17.4 Unlinked mentions (search title + match **cả cụm** qua `/api/search/matches`
      `phrase:true`, loại note đã link) + Outgoing links (parse wikilinks, resolved/unresolved,
      lọc attachment khỏi unresolved, click mở/tạo)

---

## Phase 18 — Markdown editor parity Obsidian Desktop (docs/obsidian-desktop-internals.md)
- [x] M18.1 CSS design tokens theo app.css 1.12.7 (§19): accent HSL 258/88%/66% + accent-1/-2
      công thức light/dark, color-base ramp đúng giá trị, extended colors + `-rgb`, semantic
      tokens (`--background-*`, `--text-*`, `--interactive-*`), heading 1.618/1.462/1.318/
      1.188/1.076/1em + letter-spacing, `--bold-modifier: 200`, `--file-line-width: 700px`,
      callout slots RGB triplet (§21); giữ alias var cũ cho component hiện hữu
- [x] M18.2 DOM classes chuẩn (§20): root `markdown-source-view cm-s-obsidian mod-cm6
      is-live-preview is-readable-line-width`; line `HyperMD-header-1..6 / -list-line /
      -task-line[data-task] / -quote / -codeblock(-begin/-end/-bg) / -hr / -footnote`; span
      `cm-hashtag(-begin/-end), cm-strikethrough, cm-inline-code, cm-hmd-internal-link,
      cm-formatting(-header/-highlight), cm-comment, cm-math, cm-footref, cm-url, cm-blockid`
- [x] M18.3 Live Preview token mới (§7): `==highlight==` ẩn marker; `%%comment%%` faint;
      footref `[^id]` superscript + render dòng definition; block id `^abc-123` faint;
      HR widget; ẩn fence ``` khi caret ngoài block; ẩn escape `\.` (file Trilium export);
      task mọi ký tự non-space = done (x/X gạch + muted); callout regex
      `/^\[!([^\]]+)\]([+-]?)(?:\s|$)/` + đủ bảng màu/icon §21 + title mặc định + fold mark
- [x] M18.4 Wikilink đúng luật §7: alias sau `|` ĐẦU, loại `[[` lồng, NBSP→space + NFC;
      LP label giữ raw `Note#Head` (aria-label = `Note > Head` như Obsidian);
      size param ảnh `![[img|300]]` / `![[img|300x200]]`
- [x] M18.5 Tag regex chính xác §7 (charset unicode, loại thuần số, cần ≥1 chữ cái);
      pill 2 nửa cm-hashtag-begin/-end
- [x] M18.6 Hotkeys mặc định §4 (lib/editorCommands.ts): Mod+B/I/K/L/D, Mod+/ (%%), Mod+E
      (edit↔reading), Mod+S, Alt+Enter follow link; toggle pair thông minh (wrap/unwrap +
      word-at-caret); Enter/Backspace tiếp tục list markup
- [x] M18.7 Suggester `[[` (file) + `#` (tag) — port nguyên công thức điểm fuzzy §9
      (lib/fuzzy.ts: token pass → per-char pass, penalty mid-word/span/offset/length,
      basename trước path −1); dropdown `.suggestion-container` chuẩn §20, flip lên khi gần
      đáy; Enter/Tab/↑↓/Esc qua keymap Prec.highest (lib/suggest.ts)
- [x] M18.8 Math render KaTeX lazy-load (inline `$..$` + `$$..$$` 1 dòng); code block
      syntax highlight (@codemirror/language-data); GFM base (strikethrough/table/tasklist);
      checkbox style Obsidian (accent bg, radius 4px, size --font-text-size)
- [x] M18.9 Line spacing khớp app.css thật: `.HyperMD-header { padding-top: var(--p-spacing) }`,
      inline-title margin-bottom 0.5em, scroller line-height var(--line-height-normal)
- [x] M18.10 Đợt sửa theo 11 lỗi người dùng báo (đối chiếu side-by-side với app):
      (1) HighlightStyle riêng (lib/highlight.ts) màu token theo palette Obsidian — hết màu đỏ
      escape/bracket lạ từ defaultHighlightStyle; (2) Embed thật: `![[note]]` transclusion render
      qua api.resolve + renderMarkdown (NoteEmbedWidget, depth ≤3), ảnh/file thiếu → box
      "could not be found"; (3) indent guide dọc cho list lồng (cm-indent mỗi đơn vị tab/4-space);
      (4) blockquote lồng `> >` render nhiều thanh (data-quote-depth + layered gradient);
      (5) checkbox/bullet hoạt động TRONG callout/quote (xử lý body sau marker);
      (6) callout fold +/-: StateField (lưu toggle, trạng thái = default XOR toggle → bền với
      async load), chevron click, `-` gập mặc định; (7) code block màu đúng + nhãn ngôn ngữ
      góc phải (data-lang); (8) display math `$$` fix thứ tự escape-pass (chạy cuối, không
      chiếm range); (9) HR hết margin thừa; (10) dòng inline-HTML (`<u>…`) render như HTML,
      mermaid render thật (lazy mermaid.js, StateField block widget); (11) block comment `%%`
      nhiều dòng xám toàn khối
- [x] M18.12 Đợt sửa 3 (4 lỗi editor + Reading parity): (1) bảng trong HTML embed cùng metrics
      với reading table; (2) inline footnote `^[...]` superscript; (3) fenced code có padding
      trong nền (16px), indented code bỏ nền + có indent guide như app; (4) embed note thêm
      `markdown-embed-title` (tên file) + fix khoảng trắng thừa (reset `white-space: normal`
      trong widget — pre-wrap của cm-content biến \n giữa các block HTML thành dòng trống);
      (5) Reading mode đồng bộ Live: task custom state `[/] [-] [>]`… thành checkbox
      (remark plugin `remarkObsidianTasks`, data-task, chỉ gạch x/X), li bỏ bullet,
      Properties hiện list value dạng pill (tags/aliases)
- [x] M18.13 Reading mode đồng bộ hoàn toàn với Live (theo phản hồi "Reading khác Live"):
      tách lib/callouts.ts dùng chung; pipeline remark thêm: remark-breaks (newline = <br>, §7),
      ==highlight== → <mark>, %%comment%% inline + block bị drop, block id ẩn, tag pill cùng
      charset editor, math $/$$ → span[data-tex] render KaTeX post-sanitize, mermaid render
      sau sanitize, callout đúng DOM §20 (icon + title-inner + content, màu theo
      data-callout→slot CSS, fold +/- click toggle, `-` gập sẵn), wikilink hiển thị
      `Note > Head` (luật reading §7), ảnh size param. Sửa bug sanitize: defaultSchema ràng
      buộc a.className (chỉ cho footnote class) làm mất class internal-link/tag — filter bỏ
      entry mặc định; thêm mark/u vào tagNames
- [x] M18.14 Reading mode = CHÍNH Live Preview editor set readonly (theo yêu cầu người dùng,
      thay kiến trúc 2 pipeline): Workspace bỏ <Preview/> cho mode reading, Editor thêm
      compartment `EditorView.editable(false)` + `EditorState.readOnly` + StateField
      `livePreviewReadonly` tắt mọi reveal-syntax-theo-caret (touches/lineActive/htmlBlock/
      mermaid/calloutFold); CSS `.is-reading-mode` ẩn affordance edit (table handles, property
      add/del, contenteditable) — checkbox và link vẫn bấm được như Obsidian. Hai chế độ giờ
      đồng nhất theo cấu trúc, không thể lệch. (Pipeline remark của Preview vẫn dùng cho
      split-pane source + public share.)
- [ ] M18.11 Tương lai: MathJax thay KaTeX (glyph parity tuyệt đối), heading/block mode
      suggester (`#`/`#^`), `$$` block nhiều dòng, click tag → search, fold heading/indent,
      chevron fold đặt sau title (hiện đặt trước)

---

## Phase 19 — Mobile / responsive UI (FR-11, theo yêu cầu người dùng)
- [x] M19.1 Hook `useIsMobile` (matchMedia 768px) + state cục bộ `mobileDrawer` ('left'|'right'|null)
      trong store (KHÔNG persist, không broadcast) → drawer điện thoại không đụng `uistate` sync desktop
- [x] M19.2 CSS `@media (max-width: 768px)`: `.app` 1 cột (workspace full-width); ribbon + sidebar trái
      thành drawer overlay trượt (translateX) + right sidebar drawer phải; backdrop mờ; touch targets ≥44px
- [x] M19.3 App shell: render sidebars luôn trên mobile (drawer), thêm backdrop đóng drawer; auto-đóng
      drawer khi mở note; hamburger (☰) + nút panel-right trên tab-bar mở drawer thay vì toggle width;
      ẩn crumbs + nút split trên view-header mobile (chống tràn)
- [x] M19.4 Edge-swipe: vuốt từ mép trái mở drawer trái, mép phải mở drawer phải, vuốt ngược để đóng
- [x] M19.5 Format toolbar (component `FormatToolbar`, dùng chung): bold/italic/heading/list/checklist/
      quote/link/internal-link/code/tag/indent/outdent/undo/redo, thao tác lên editor active qua
      `lib/activeEditor`; chỉ hiện khi soạn (Live/Source) note .md. Mobile = fixed neo trên bàn phím qua
      visualViewport; **Desktop = thanh in-flow dưới view-header** (theo yêu cầu người dùng)
- [x] M19.6 Viewport `viewport-fit=cover` + `interactive-widget=resizes-content` + safe-area insets;
      verify trên Chrome device emulation 390×844
- [x] M19.7 Mobile parity vòng 2 (theo phản hồi người dùng): (a) menu "…" của note (ContextMenu) bị
      cắt → clamp vị trí trong viewport (top/left ≥8px, ước lượng cao chặn theo `innerHeight`) +
      `max-height: 100dvh` cuộn được, rows to hơn cho cảm ứng; (b) khoá pan ngang nội dung note
      (`overflow-x: hidden` trên `.cm-host`/`.markdown-preview`, chữ wrap `overflow-wrap: anywhere`,
      ảnh/code/bảng tự co/cuộn trong); (c) modal Settings + Version history full-screen trên mobile
      (`position: fixed; inset:0`), settings-nav thành strip cuộn ngang, `.setting-row` stack dọc,
      input full-width, version-history list xếp trên preview; share dialog full-width

## Phase 20 — Graph node search & jump (theo yêu cầu người dùng, PRD 0.5)
- [x] M20.1 Ô "Find node…" nổi trên Graph view: gõ keywords → danh sách node khả dĩ (match
      label/path mọi từ, rank tag trước hết > prefix > label > path + degree, top 50); click hoặc Enter (kết quả
      đầu) → camera bay (pan+zoom lerp 15%/frame, zoom tối thiểu 2×) tới node + highlight kiểu
      hover (accent + dim phần không liên kết) tới khi di chuột; Esc đóng; wheel/drag hủy fly

---

## Phase 21 — Pane ⋯ menu parity Obsidian (theo yêu cầu người dùng, PRD 0.6)
- [x] M21.1 Menu ⋯ dựng lại theo cấu trúc Obsidian Desktop: nhóm Backlinks in document →
      Split/Open in new window → Rename/Move/Make a copy/Bookmark/Add file property/Export to PDF →
      Find → Copy path/Version history/Open linked view → Reveal in navigation/Share → tabs → Delete
- [x] M21.2 Find/Replace trong note: tích hợp `@codemirror/search` (search panel top, ⌘F/⌘⇧F/⌘G);
      item "Find…" gọi `openSearchPanel` qua `editorFind()` (activeEditor handle)
- [x] M21.3 Reveal file in navigation: `store.revealInTree` mở rộng folder tổ tiên + mở panel Files,
      FileTree nghe event `wo-reveal-file` → scrollIntoView + flash highlight 1.2s (data-path lookup)
- [x] M21.4 Add file property: KHÔNG dùng prompt — `triggerAddProperty(view)` kích hoạt đúng nút
      "+ Add property" của Properties widget (focus ô key + mở dropdown gợi ý key như Obsidian); tạo
      block `---` rỗng nếu note chưa có frontmatter rồi poll tới khi widget mount; menu chuyển Live trước.
      Fix kèm trong widget: (a) dropdown giá trị list/tags bị treo sau khi chọn (dd mount trên theme
      wrapper, không bị widget rebuild gỡ → `choose()` luôn `cleanup()` trước `mutate()`); (b) menu
      Property type/Copy/Remove giật giật khi left-click icon (mở bằng `mousedown` rồi `click` kế tiếp
      đóng ngay) → đổi sang `click` (openPropMenu đã `stopPropagation`)
- [x] M21.5 Export to PDF: chuyển Reading view rồi `window.print()`; CSS `@media print` ẩn ribbon/
      sidebar/tab/header/toolbar/status, chỉ in nội dung note (màu đen nền trắng, `@page` margin 16mm)
- [x] M21.6 Open version history (FR-4): server `git.log(path)` + `git.showFile(hash, path)` →
      routes `GET /api/git/log|/show`; modal `VersionHistory.tsx` liệt kê commit chạm file, preview
      nội dung version, "Restore this version" ghi đè + reload; rỗng khi chưa bật Git Sync
- [x] M21.7 Open in new window: `window.open(pathToUrl(path))` mở deep-link `/note/<path>` ở tab mới;
      Open linked view submenu (Backlinks/Outgoing links/Outline → `setRightPanel`)

---

## Phase 22 — Folder picker "Move file to…" + context menu Bookmarks/Recent (theo yêu cầu người dùng)
- [x] M22.1 Modal folder-picker kiểu Obsidian suggester (`FolderPicker.tsx`): gõ lọc folder, ↑↓
      điều hướng, ↵ move vào folder chọn, ⇧↵ tạo folder mới theo tên gõ rồi move, esc đóng; footer
      gợi ý phím. Driven bởi `store.movePath`/`setMovePath`. Thay `prompt()` cũ ở menu ⋯ (Workspace)
      và menu chuột phải file tree (FileTree). Lọc bỏ folder hiện tại + chính nó/con khi move folder.
- [x] M22.2 Context menu chuột phải cho panel Bookmarks & Recent (`BookmarksPanel.tsx`):
      Open/Open to right/Reveal in navigation/Move file to…/Bookmark↔Remove bookmark/Copy path;
      mục Recent thêm "Remove from recent" (`store.removeRecent`). Trước đây right-click rơi vào
      menu native của trình duyệt vì panel chưa có `onContextMenu`.
- [x] M22.3 Kéo-thả hàng Bookmark/Recent vào folder ở file tree để move (dùng chung payload
      `text/wo-path` mà FileTree đã đọc) + nút hành động hiện khi hover trên mỗi hàng (📁 Move file
      to… và ✕ Remove bookmark / Remove from recent).

## Phase 23 — Render HTML trong ```html code block (theo yêu cầu người dùng)
- [x] M23.1 Nút "Render HTML" trên mỗi block ` ```html ` — `htmlPreviewField` (StateField block
      widget trong `livePreview.ts`, đăng ký ở `Editor.tsx`). Vì Reading/Live đều là CodeMirror
      (M18.14), nút phải nằm trong editor chứ không phải `Preview.tsx`. Widget đặt NGAY TRÊN dòng
      mở fence (`side: -1`) — block HTML có thể khổng lồ (cả trang lưu ~296KB), nếu đặt sau block
      thì nút lọt ngoài viewport (CodeMirror ảo hoá DOM) → không bấm được. Click toggle hiện/ẩn
      `<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals">` (KHÔNG same-origin →
      script trang lưu chạy nhưng cô lập khỏi vault/cookie/localStorage app), source vẫn hiển thị
      bên dưới. CSS `.cm-html-preview` + iframe 70vh resize dọc. Cùng nút thêm vào `Preview.tsx`
      (`setupHtmlPreview`, bọc `.html-block`) cho trang public `/share`. Verify thực tế qua CDP:
      iframe render đúng trang ChatGPT đã lưu. Typecheck + build sạch.
- [x] M23.2 (theo phản hồi): khi render thì (a) ẩn luôn code block, (b) iframe full-width pane.
      Thêm state `htmlRenderedState` + effect `toggleHtmlRender` (giống callout fold) để biết block
      nào đang render → rendered thì `Decoration.replace` cả block (ẩn code + chèn iframe), collapsed
      thì chỉ chèn nút phía trên (code vẫn hiện). Full-width: content căn giữa cột `--file-line-width`
      700px nên `.is-rendered` dùng `left:50% + translateX(-50%)` + width = `view.scrollDOM.clientWidth`
      (JS, sync on resize) để trải hết bề rộng scroller. Verify CDP: iframe 992px khớp pane, code ẩn,
      toggle 2 chiều OK.

## Phase 24 — Copy/Cut/Paste trong context menu file tree (FR-1, theo yêu cầu người dùng)
- [x] M24.1 Clipboard state ở store: `clipboard: {path, mode:'copy'|'cut'} | null` + `setClipboard`
      (session-local, KHÔNG nằm trong `PERSIST_KEYS` nên không lưu server/broadcast). Menu chuột phải
      file thêm Copy/Cut, folder thêm Copy/Cut; mục Paste chỉ render khi clipboard có dữ liệu. Row bị
      Cut làm mờ (`opacity .5`).
- [x] M24.2 `doPaste` (FileTree): đích = folder click hoặc thư mục cha của file. Cut → `api.rename`
      (move file/folder; dán đúng chỗ cũ = no-op; chặn dán folder vào chính nó/thư mục con; xoá clipboard
      sau khi dán). Copy → `api.copy` đệ quy, `uniqueChildName` né trùng tên (`… copy`/`… copy N`), giữ
      clipboard để dán nhiều lần.
- [x] M24.3 Server: `vault.copy(from,to)` dùng `fs.cp` recursive (file + folder), trả danh sách file
      tạo ra để reindex; throw nếu đích tồn tại. Route `POST /api/files/copy` upsert search + link graph
      cho các `.md` mới rồi schedule auto-commit. Client `api.copy`. Typecheck server + web sạch.
- [x] M24.4 (theo phản hồi): right-click vùng trống file tree giờ ra context menu của app (trước rơi vào
      menu native trình duyệt). `onRootContext` trên div FileTree (`minHeight:100%` phủ hết `.sidebar-body`):
      New note / New folder (vault root) + Paste (chỉ khi có clipboard) → `pasteToRoot` dán vào vault root
      (Cut = `rename` về root, Copy = `api.copy` né trùng tên). Áp cả nhánh "Vault is empty.".

## Phase 25 — Canvas (FR-12, PRD 1.0, theo yêu cầu người dùng)
- [x] M25.1 `web/src/lib/canvas.ts`: types JSON Canvas (CanvasNode text/file/link/group, CanvasEdge),
      parse/serialize an toàn (`{nodes:[],edges:[]}` mặc định khi rỗng/hỏng), helpers id (genId),
      preset colors `1..6`→hex, hình học edge (anchor theo side + Bézier path), hit-test bbox.
- [x] M25.2 `web/src/components/CanvasView.tsx`: view tự quản (như GraphView) đọc store `content`,
      parse, render. Pan/zoom (wheel zoom tâm con trỏ, kéo nền pan, space+drag), lưới chấm nền. Nodes
      tuyệt đối trong container transform; SVG layer cho edges (dưới nodes). Toolbar zoom in/out/fit/100%.
- [x] M25.3 Node interactions: double-click nền → text node + edit; drag move; 8 resize handles;
      double-click text node → textarea edit (Esc/blur thoát); file node render embed (note=Preview,
      ảnh=`<img src=rawUrl>`); link node = `<a>` card; đổi màu palette; xóa Delete/Backspace.
- [x] M25.4 Edge interactions: hover hiện 4 chấm cạnh; kéo chấm→node khác tạo edge (mũi tên đầu `to`);
      double-click edge thêm/sửa label; chọn edge đổi màu/xóa. Select: click, marquee, Shift+click,
      di chuyển/xóa nhóm; context toolbar nổi (màu, xóa).
- [x] M25.5 Autosave debounce ~900ms qua `setContent`+`save` (mark dirty → ghi `.canvas`). Wire vào
      `Workspace.tsx` (render CanvasView khi path `.canvas`, không phải folder/graph). CSS `.canvas-*`.
- [x] M25.6 Tạo canvas mới: store `newCanvas(dir)` (Untitled.canvas né trùng, body `{"nodes":[],"edges":[]}`);
      "New canvas" vào context menu FileTree (file/folder/root) + command palette. Typecheck web sạch.
- [x] M25.7 **Marquee select (Shift+kéo) + alignment snap (parity Obsidian, reverse-engineer asar):** kéo trái
      trên nền = **pan** (giữ theo ý người dùng — bỏ thử nghiệm marquee-mặc-định), **Shift+kéo = marquee chọn**;
      pan cũng qua Space/giữa/phải-kéo, touch 1-ngón pan. Kéo node: snap cạnh/tâm vào các node khác (`snapMove`
      trong canvas.ts, port `getSnapping/O3/P3`,
      điểm snap = 4 góc + tâm, dist = `ceil(15/scale)`), vẽ **guide line** (`.canvas-snaps`); Alt (⌃ trên mac) tắt
      snap; Shift khi kéo = khoá trục. Verify CDP: marquee chọn 5 node, guide hiện khi căn rồi mất khi thả.
- [x] M25.8 **Phím tắt format trong text card** (mirror `obsidianKeymap`): ⌘B/I/K(add link)/L(task)/`⌘/`(comment)
      trên textarea; `toggleWrap` bật/tắt marker. **Text alignment**: `TextNode.textAlign` (left/center/right) —
      nút trong selection menu (khi chọn text node) + submenu "Align" trong menu chuột phải; áp CSS cho cả textarea
      lẫn body render. (Mở rộng ngoài JSON Canvas spec — Obsidian thật bỏ qua field này.)
- [x] M25.9 **Fix UX theo phản hồi:** (1) mũi tên edge to hơn (marker 14×14, refX 11). (2) menu chuột phải card
      mở **đúng tại con trỏ** + `position:fixed` + đo kích thước rồi dịch vào trong màn hình (không tràn).

## Phase 26 — Ảnh: resize + zoom lightbox (FR-2, PRD 1.2, theo yêu cầu người dùng)
- [x] M26.1 `web/src/lib/imageLightbox.ts`: lightbox toàn màn hình singleton (gắn `document.body`).
      Wheel zoom theo con trỏ + pinch 2-ngón theo tâm (transform-origin 0 0, công thức giữ điểm cố định),
      kéo chuột/1-ngón pan, double-click reset (fit ≤ natural), Esc/click nền/nút × để đóng; listener pan
      gắn theo từng lần kéo nên không rò.
- [x] M26.2 Live Preview `ImageWidget` (livePreview.ts): 2 handle cạnh trái/phải hiện khi hover, kéo đổi
      rộng (clamp 40..contentDOM width, giữ tỉ lệ). `writeImageWidth()` recover vị trí qua `posAtDOM`, tìm
      lại token embed phủ vị trí đó và ghi size param: `![[img|W]]` (wikilink) / `![alt|W](url)` (markdown) —
      thay segment số cuối nếu có, không thì append. Click ảnh (không kéo) → `openLightbox`.
- [x] M26.3 Size param cho ảnh markdown `![](…)`: alt mang `|W`/`|WxH` → width/height ở **cả** Live
      (livePreview.ts imgRe) lẫn Reading (markdown.ts) — trước chỉ wikilink `![[…]]` mới có size.
- [x] M26.4 Reading view (Preview.tsx) click `<img>` → `openLightbox(currentSrc, alt)`; CSS handle resize
      (`.cm-image-resize`) + `.image-lightbox*` + cursor `zoom-in`. Typecheck sạch.

## Phase 27 — Desktop app (Electron, multi-platform) — FR-13, PRD 1.5 (theo yêu cầu người dùng)
- [x] M27.1 Workspace `desktop/` (Electron shell). `src/main.ts`: single-instance lock; chọn vault lần đầu
      (dialog, default `~/Documents/WebObsidianVault`); `DATA_DIR`/config/logs trong `userData`; **spawn server
      hiện có như tiến trình con** qua `ELECTRON_RUN_AS_NODE` bind `127.0.0.1` + cổng trống ngẫu nhiên; chờ
      `/healthz`; `BrowserWindow` load `http://127.0.0.1:<port>`; menu File (Switch Vault / Open Vault·Data·Logs),
      Edit/View/Window/Help; mở external link ra browser hệ thống; kill server khi quit. `src/preload.ts` tối giản.
- [x] M27.2 Auto-login liền mạch: sinh mật khẩu ngẫu nhiên/máy (lưu `userData`), truyền `WEBOBSIDIAN_PASSWORD`
      (override); login qua Electron `net`, lấy JWT từ `Set-Cookie`, đổi pass mặc định→secret bằng Bearer để
      tắt `mustChangePassword`, rồi **seed cookie JWT vào `session.defaultSession`** → cửa sổ vào thẳng app, không
      hỏi password. Verify: data dir fresh → `login` trả `mustChangePassword:false`, `userPasswordHash` đã set.
- [x] M27.3 Build pipeline `scripts/build.mjs`: esbuild bundle `desktop/src` (main+preload, external `electron`)
      → `dist/`; esbuild bundle **server đã compile** (`server/dist/index.js`) thành 1 file ESM
      `.gen/server/dist/index.mjs` (external `fsevents`, banner `createRequire`); copy `server/public` →
      `.gen/server/public`. Bundle server smoke-test chạy được (healthz/login OK).
- [x] M27.4 electron-builder config (trong `desktop/package.json`): `extraResources` map `.gen/server`→
      `resources/server`; targets macOS `dmg`+`zip` (arm64/x64), Windows `nsis`+`portable` (x64/arm64/ia32),
      Linux `AppImage`+`deb` (x64/arm64); icon từ `assets/logo.png`→`buildResources/icon.png` (1024²);
      `electronVersion` pin 33.4.11 (workspace hoist). Verify: `electron-builder --dir` đóng gói `WebObsidian.app`,
      chạy bản packaged → server boot từ `resources/server/dist/index.mjs`, healthz/login OK.
- [x] M27.5 CI: `.github/workflows/release.yml` trigger tag `v*` (+ manual), matrix macOS/Windows/Ubuntu, mỗi
      runner `npm ci` → `npm run build` → `npm --workspace desktop run dist:publish` (electron-builder publish
      GitHub Release draft, `GH_TOKEN`, `CSC_IDENTITY_AUTO_DISCOVERY=false`). `ci.yml` thêm typecheck + build
      bundle desktop. Root scripts `desktop`/`desktop:dist`/`desktop:publish`; `.gitignore` thêm `desktop/.gen`,
      `desktop/release`.
- [x] M27.6 Chuẩn bị release v0.1.2 cho fork `lakylekidd/webobsidian`: bump root + desktop theo lịch sử v0.1.1,
      đồng bộ lockfile, publish target/homepage/download links trỏ về fork; kiểm chứng typecheck + build
      web/server/desktop OK. Workflow fork đang active; push annotated tag `v0.1.2` để CI tạo draft release,
      chỉ Publish sau khi cả ba runner hoàn thành.

- [x] M27.7 External media embeds (#6): URL YouTube/Instagram/Facebook đứng riêng một dòng render inline
      (Reading, Live Preview, Public Share); whitelist trong `web/src/lib/embeds.ts` (+ bản server), iframe
      dựng lại từ ID đã validate sau sanitize; CSP `frame-src` chỉ thêm 3 domain.

## Phase 28 — Inline rename trong file tree (FR-1, issue #19)
- [x] M28.1 Double-click tên file/folder để vào inline rename qua `RenameInput` hiện có; giữ Rename context menu,
      Enter xác nhận, Escape huỷ, click đơn vẫn xử lý bình thường. Web typecheck + production build sạch.
      `Editor.tsx` không `v.focus()` khi đang rename (double-click note chưa mở: editor mount cướp focus làm input bị blur/đóng).

## Phase 29 — List hanging indent compatibility (FR-2, issue #20)
- [x] M29.1 Tạo prefix indent bằng phép cộng và phép trừ CSS `calc()` thay phép nhân, để hanging indent hoạt động ổn định trên Edge với bullet, numbered, task và nested lists. Typecheck/build sạch; Chromium xác nhận wrapped line thẳng hàng cho bullet, numbered, task và nested list.

## Phase 30 — Trash retention (FR-1, PRD 1.8)
- [x] M30.1 Setting `vault.trashRetentionDays` (int 0–3650, mặc định 30; 0 = giữ mãi) + validate ở `PUT /api/settings` + ô nhập trong Settings → Vault & Files.
- [x] M30.2 Ghi thời điểm vào trash: `services/trashindex.ts` (`<trash>/.trash-index.json`, khoá theo path, lock tuần tự, guard path escape); `vault.trash()` ghi, restore/xoá item cập nhật; `listTrash` trả thời điểm xoá thật.
- [x] M30.3 Purge: `services/trashretention.ts` — chạy sau khi khởi động (15s), mỗi giờ và ngay khi đổi setting; item chưa có index được backfill = "now" (không xoá ngay trash cũ); chỉ log số lượng, không log tên.

## Phase 31 — Local attachment folders + xoá ảnh (FR-1/FR-2, PRD 1.9, issue #30)
- [x] M31.1 Dán/drop ảnh → `<thư-mục-note>/attachments/` (tự tạo, tên unique), chèn `![](attachments/x.png)` tại caret.
- [x] M31.2 Server: `GET /files/content|resolve` nhận `from` (resolve tương đối theo note, fallback basename); `GET /files/references`; `DELETE /files?permanent=1`.
- [x] M31.3 Icon thùng rác khi hover ảnh (Live Preview + Reading): gỡ tham chiếu, kiểm tra tham chiếu khác, xoá vĩnh viễn hoặc cảnh báo + chỉ gỡ khỏi note.

## Phase 32 — Manual sorting trong file explorer (FR-1, issue #34)
- [x] M32.1 Thêm sort mode `manual` vào `treeSort` (persist trong uistate), menu "Change sort order" có mục Manual.
- [x] M32.2 Lưu metadata thứ tự thủ công theo từng thư mục (`manualOrder`: key = parent folder path, value = child paths) và reconcile khi tree thay đổi để giữ thứ tự cũ, item mới append cuối.
- [x] M32.3 Drag-and-drop ở Manual mode: thả lên sibling row để reorder file/folder trong cùng thư mục; không rename file/folder.
- [x] M32.4 Chuyển sang mode sort khác không xoá metadata manual; chuyển lại Manual khôi phục thứ tự trước đó.

## Phase 33 — Reveal active file in explorer (FR-1, issue #36)
- [x] M33.1 Thêm setting `Reveal active file in explorer` trong Settings → Vault & Files, dùng chung state `autoReveal` đã có (persist qua uistate), đồng bộ wording với nút toggle ở header Files.

## Phase 32 — Live Preview: click đúng dòng (height map của CodeMirror) — FR-2 (theo yêu cầu người dùng)
- [x] M32.1 Xác định nguyên nhân bằng browser thật (Chromium + CDP, dev instance, vault test dựng riêng):
      CodeMirror đo block theo border-box rect và giả định các block xếp liền nhau → `margin` dọc giữa hai
      block không vào height map → map ngắn hơn DOM (đo: title+properties+table = −76px) → click phía dưới
      rơi xuống 1–2 dòng. Bằng chứng trước/sau: 17/22 click lệch 1 dòng → 60/60 click đúng dòng.
- [x] M32.2 Sửa: bỏ `margin` dọc trên mọi block widget của editor, thay bằng `padding` trên đúng box mà
      CodeMirror đo — `.cm-inline-title`, `.cm-properties` (shell trong `FrontmatterWidget.toDOM`),
      `.cm-table-wrap` (+ `display:block; width:fit-content` để bỏ ~7px của line box ẩn do `inline-block`),
      `.cm-html-preview`, `.cm-html-block`, `.cm-mermaid`. Margin **bên trong** block có padding vẫn giữ.
- [x] M32.3 Ảnh/iframe load sau khi CodeMirror đo → map thiếu đúng chiều cao ảnh: thêm
      `mediaLoadRemeasure` (re-measure khi `load`/`error` trong editor).
- [x] M32.4 Guard chống tái phạm: `web/tests/editorSpacing.test.ts` (CI, fail khi có margin dọc trên block
      của editor; self-check của parser) + `livePreviewGeometryGuard` (dev-only, warn khi map ngắn hơn nội
      dung render). Quy ước ghi ở README › *Live Preview geometry* và CONTRIBUTING.
- [x] M32.5 Kiểm chứng: `npm test` + typecheck + build sạch; audit hình học trên 16 note test (mỗi loại
      widget một note) cho `map height == rendered height`; layout các block khác không lệch 1px so với
      trước khi sửa (chỉ khoảng trắng "ảo" dưới table mất đi).

## Phase 33 — Dark mode: caret + panel Find & Replace của CodeMirror theo theme — FR-2 (theo yêu cầu người dùng)
- [x] M33.1 Xác định nguyên nhân: `drawSelection()` ẩn caret gốc và vẽ `.cm-cursor` với màu hard-code
      `black`; `.cm-panels` (Find & Replace) hard-code `#f5f5f5`/chữ đen. Cả hai chỉ đổi sang bản `&dark`
      khi facet `darkTheme` bật, mà app theme bằng CSS variable trên wrapper `.theme-*` → facet không bao
      giờ bật. Đo được trên browser thật: caret `.cm-cursor` = `rgb(0,0,0)` trên nền `rgb(30,30,30)`;
      panel `rgb(245,245,245)` + input trắng trên UI tối.
- [x] M33.2 Sửa trong `web/src/styles/obsidian.css`: caret dùng `var(--text-normal)` (kèm `.cm-dropCursor`),
      panel/`.cm-textfield`/`button.cm-button` theo palette (`--background-secondary`, `--background-primary`,
      `--bg-modifier-border`, `--interactive-accent`, `--text-on-accent`).
- [x] M33.3 Kiểm chứng (CDP + computed style + screenshot có vision đọc lại): caret `#dadada`/nền `#1e1e1e`
      (Obsidian Dark — trước là `#000`), `#222222`/trắng (light), `#cdd6f4`/`#1e1e2e` (Catppuccin Mocha);
      panel `rgb(38,38,38)`/chữ `#dadada`, light `#f6f6f6`, ctp-mocha `#181825`. Guard: `web/tests/editorTheme.test.ts`.

## Phase 34 — Tasks view: Kanban board over `type: task` notes — FR-15 (issue #31)
- [x] M34.1 `server/src/services/tasks.ts`: module thuần chuẩn hoá `status`→cột (canonical + alias),
      `taskRecordFrom(rel, parsedNote)` (loại trừ folder `templates`), `filterTasks`; unit test
      `server/src/services/tasks.test.ts`.
- [x] M34.2 Tích hợp vào QMD index (`server/src/services/search.ts`): `tasks: Map<string, TaskRecord>`
      tính trong `toDoc`, xoá trong `remove`, reset trong `build`; **không** persist — sau `restore()` lúc
      boot gọi `qmd.refreshTasks()` (quét vault 1 lần) để không phục vụ trạng thái cũ sau restart
      (test `server/src/services/search.test.ts`); expose `qmd.allTasks()`.
- [x] M34.3 `server/src/routes/tasks.ts` (`GET /api/tasks`, cookie auth) + `agentRouter.get('/tasks', …)`
      scope `read` trong `server/src/routes/agent.ts`; mount `/api/tasks` trước `searchRouter` trong
      `server/src/index.ts`. Test `server/src/routes/tasks.test.ts` (chọn task, từng filter, 401/403/200).
- [x] M34.4 Compare-and-set trên đường ghi file hiện có: `GET /api/files/content` trả thêm `version`
      (`server/src/services/noteversion.ts`, helper `checkVersion`); `PUT /api/files/content` nhận
      `baseVersion` tuỳ chọn → lệch (hoặc file đã mất mà `baseVersion ≠ ''`) `409 version_conflict`
      (không ghi), absent thì hành vi cũ giữ nguyên. Test CAS trong `routes/tasks.test.ts` +
      `services/noteversion.test.ts`.
- [x] M34.5 `web/src/lib/tasks.ts`: twin normalise trạng thái/alias/cột (đồng bộ comment với module
      server), `columnsFor`, `columnIdFor`, `isMissingStatus`, `isOverdue`, `moveTask`, `setTaskStatus`
      (chèn/thay `status:`/`updated:`, giữ nguyên phần còn lại + line ending), `changeTaskStatus` (dùng
      `api`, truyền `version` làm base, propagate lỗi 409). Unit test `web/tests/tasks.test.ts`.
- [x] M34.6 Wiring: `web/src/lib/store.ts` (`TASKS_PATH = 'tasks://view'` + `openTasks()`, mọi chỗ so
      sánh `GRAPH_PATH` như virtual view audit lại cho `TASKS_PATH`), `web/src/lib/urlsync.ts`
      (`/tasks` ↔ `TASKS_PATH`, `?mode=`), ribbon (icon "Tasks"), command palette ("Open tasks board").
- [x] M34.7 `web/src/components/TasksView.tsx`: cột + thẻ (title/priority/owner/due/tags/path hint,
      dấu chấm "no status"), kéo-thả HTML5 giữa cột + context menu "Move to → …", filter bar
      (folder/priority/owner/free-text) + Refresh thủ công + auto-refresh debounce theo sự kiện
      `wo-fs`, mode toggle Board|Timeline (Timeline ẩn ở phần 1), empty state link
      `Wiki/templates/task.md`, style dark/light qua CSS variable sẵn có.
- [x] M34.8 `deploy/smoke.sh`: assertion `GET /api/tasks` không session → 401; có `env_pw` thì login +
      assert 200 với JSON `tasks` array.
- [x] M34.9 Docs: PRD.md (FR-15 + changelog), IMPLEMENTATION_PLAN.md (phase này), CHANGELOG.md
      (Unreleased/Added), README.md (feature list), docs/AGENT_API.md (`GET /api/v1/tasks`).
- [x] M34.10 Kiểm chứng thật trên vault fixture: `/tasks` render đúng 6 note `Wiki/tasks/`, cột lạ/thiếu
      status đúng quy tắc; kéo thẻ đổi `status:`/`updated:` trong file thật (paste `git diff`); ghi lỗi
      (409/mất mạng) → rollback + notify; `curl` `GET /api/tasks` và `GET /api/v1/tasks`.
- [x] M34.11 Kiểm chứng deploy: sau khi merge `a1158ad`, CI xanh → `Deploy (LXC 107)` success;
      `curl /healthz` → `build=a1158ad` (== merge commit), `/tasks` HTTP 200, bundle deploy chứa
      `tasks://view`; `GET /api/v1/tasks` bằng key scope `read` trả **6 task thật** của vault (template
      bị loại, alias `waiting`→`blocked` đúng); 401 khi thiếu key. Xem comment kiểm chứng trên issue #31.

## Phase 35 — Tasks view: Timeline/Gantt — FR-16 (issue #32)
- [x] M35.1 `web/src/lib/gantt.ts`: module thuần trên **chỉ số ngày UTC** — `parseDay`/`dayToISO`,
      `barFor` (raised→created→hôm nay; thiếu `due` → mở; kẹp `due` < start), `computeRange` (pad 3 ngày,
      luôn chứa hôm nay, rỗng → ±15 ngày), `barGeometry` (bao gồm cả hai đầu, floor `MIN_BAR_PX`),
      `todayX`, `ticksFor` (Day/Week/Month + fallback 1 nhãn). Unit test `web/tests/gantt.test.ts`.
- [x] M35.2 `web/src/components/GanttChart.tsx`: thanh theo trạng thái (màu cột board, lạ →
      `status-unknown`), badge priority, quá hạn viền đỏ, mở nét đứt, đường hôm nay, cột nhãn sticky +
      nhãn click mở note, zoom Day/Week/Month + nút cuộn về hôm nay, tooltip title·status·owner·ngày.
      CSS `.gantt*` trong `web/src/styles/obsidian.css` (gridline theo `--gantt-day-w`).
- [x] M35.3 Nối vào TasksView: `mode` đọc từ store, nút Timeline hiện (bỏ `hidden`), Board|Timeline
      chuyển tại chỗ; command palette thêm "Open tasks timeline".
- [x] M35.4 Deep link `/tasks?mode=timeline`: `tasksMode` trong store (không persist) + `pathToUrl(path,
      tasksMode)` + `modeFromUrl(pathname, search)`; **sửa bug** URL bị `urlsync` ghi đè thành `/tasks`
      khi restore (rơi âm thầm về board) — test hồi quy trong `web/tests/urlsync.test.ts` + kiểm chứng DOM
      "reload giữ timeline".
- [x] M35.5 Kiểm chứng thật trên vault fixture (10 note = 6 note thật + 4 fixture biên): headless Chromium
      so **hình học từng thanh với kỳ vọng tính độc lập bằng Python** từ frontmatter (10/10 khớp), đường
      hôm nay, nhãn trục, 3 mức zoom, lớp overdue/open-ended/unknown, click thanh + nhãn mở note, toggle,
      reload giữ timeline, cuộn ngang ở 390px, không lỗi console — 22/22 PASS.
- [x] M35.6 Kiểm chứng deploy: sau merge `5b59ac0`, CI xanh → `Deploy (LXC 107)` success; `curl /healthz`
      → `build=5b59ac0`, `/tasks?mode=timeline` HTTP 200, bundle deploy chứa `gantt-bar`/`gantt-day-w`/
      `mode=timeline`; `GET /api/v1/tasks` (key scope `read`) trả 6 task thật của vault — comment trên issue #32.
- [ ] M35.7 Người dùng kiểm tra bằng mắt trên deployment thật (kéo thả của FR-15 + Timeline của FR-16).
- [x] M35.13 `weekZoomPxPerDay`/`daysAheadVisible`: zoom Week theo bề rộng trục, mục tiêu **8 tuần tới**
      + 12% ngữ cảnh phía sau, kẹp `[4, 20]` px/ngày; Month còn 3px/ngày để giữ thứ tự zoom; unit test
      cho cả ba bề rộng điển hình (rộng/laptop/390px) và trường hợp chạm sàn.
- [x] M35.14 `computeRange` luôn vẽ tới **hôm nay + 56 ngày** (runway 8 tuần) kể cả khi mọi task đến hạn
      sớm hơn; test cập nhật theo hợp đồng mới.
- [x] M35.15 Nhãn tick tuần theo mật độ (`Sep 14` ↔ `14`) + quy tắc chống chồng nhãn 24/40px, đường lưới
      giữ nguyên; test cho cả ba mức mật độ.
- [x] M35.16 Cột nhãn compact theo bề rộng **pane**; chip "N weeks ahead" trên thanh công cụ; kiểm chứng
      headless ở 1440/1000/390px đều đạt **8.0 tuần tới** (42/42 check PASS).
- [x] M35.8 Dải tháng + tick tuần/ngày/tháng, nhãn ngày dạng `Sep 28`; helper thuần `dayToShort`,
      `monthLabel`, `isWeekend`, `weekendSpans`, `monthSpans`, `dayGridlines` + unit test.
- [x] M35.9 Lưới phân cấp (hairline ngày / đường tuần / đường tháng 2px) thay cho gradient mỗi ngày;
      nền cuối tuần; hôm nay = dải + đường + nhãn `Today`; cột nhãn sticky có bóng đổ.
- [x] M35.10 Thanh: chip priority, tên task trong thanh khi đủ rộng, mờ dần khi mở, viền+sọc khi quá
      hạn, focus-visible; cột nhãn nêu **tên trạng thái bằng chữ**; đo tương phản ≥ 4.5:1 cả hai theme.
- [x] M35.11 Compact ≤640px: cột nhãn 132px, meta rút gọn, ẩn tên task trong thanh.
- [x] M35.12 Sửa bug auto-scroll "về hôm nay" (kẹp về 0 lúc chưa có task, `lineX` cũ) — effect phụ
      thuộc `[lineX, pxPerDay]`, observe container **và** grid, nhường người dùng khi họ tự cuộn/đổi
      zoom; test DOM khẳng định đường hôm nay phải **nằm trong vùng nhìn thấy**.

## Phase 36 — Tasks view: lọc theo trạng thái, mặc định ẩn Done — FR-15 (issue #39)
- [x] M36.1 `web/src/lib/tasks.ts`: `DEFAULT_HIDDEN_STATUSES` (chỉ `done`), `statusFacets` (4 chuẩn theo
      thứ tự cột kể cả 0 thẻ + giá trị lạ theo alphabet, kèm số thẻ), `filterByStatus` (resolve alias
      trước khi ẩn), `hiddenByStatus`; unit test trong `web/tests/tasks.test.ts` (alias `closed`→done,
      giá trị lạ, thẻ thiếu `status`, số đếm).
- [x] M36.2 TasksView: hàng "Status" với chip có số thẻ + `aria-pressed`, mặc định ẩn `done`;
      `visibleTasks` cho timeline; mọi cột vẫn vẽ với `+N hidden` và lý do trong thân cột (cột Done giữ
      vai trò chỗ thả); nút `N hidden — show all`.
- [x] M36.3 Kiểm chứng headless: Done ẩn mặc định / các trạng thái khác (kể cả `escalated`) hiện; bật
      Done → 10 thanh, tắt → 9; cột Done rỗng với `+1 hidden`; hình học thanh vẫn khớp kỳ vọng Python
      (9/9); 51/51 check PASS.

## Phase 37 — Tasks view: đặt hạn từ board/timeline + quy ước `due` — FR-15 (issue #41)
- [x] M37.1 `web/src/lib/tasks.ts`: tách phép ghi frontmatter dùng chung `writeFrontmatterKeys` (một chỗ lo
      BOM/CRLF/thứ tự key), `setTaskStatus`/`setTaskDue` chỉ còn khai báo key; thêm `isUndated`,
      `changeTaskDue` (CAS). 9 unit test mới (thay/thêm dòng `due`, `none` không bị quote, tạo frontmatter,
      giữ CRLF+BOM, và một test khoá hành vi `setTaskStatus` sau refactor).
- [x] M37.2 Nút hạn trên thẻ (caret ▾, editor tại chỗ) + menu `⋯` "Set due date…"/"Clear due date" +
      control tương tự ở cột nhãn timeline (`.gantt-label-cell` tách khỏi nút tiêu đề để không lồng button);
      optimistic + rollback + notify.
- [x] M37.3 Chip "Needs a due date" (đếm theo tập đang hiện) + bộ lọc chỉ-hiện-task-chưa-hạn.
- [x] M37.4 Vault: `Wiki/templates/task.md` (`due: YYYY-MM-DD` + quy ước), `Wiki/SCHEMA.md` (`due` bắt
      buộc, `none` là ngoại lệ cố ý, hạn đặt từ board); bump `updated` cả hai. Patch skill
      `document-to-action-items` + `meeting-action-items`: giữ nguyên "không bịa ngày", thêm yêu cầu
      *quyết định* ngày — không có ngày thì ghi `due: none` để hiện ở "Needs a due date".
- [x] M37.5 Kiểm chứng headless 63/63 PASS, gồm 12 check cho hạn: đặt hạn từ thẻ → **đọc file trên đĩa**
      xác nhận đúng dòng `due:` được ghi và chỉ `due:`/`updated:` đổi; chip đếm 3 → 2; lọc undated;
      timeline có chip "no due" bấm được; Esc không ghi; Clear trả về `due: none`. Hai bug thật do kiểm
      chứng bắt: (a) `showPicker()` nuốt phím Enter (bỏ); (b) click **Clear** làm input blur → commit →
      editor unmount trước khi click tới nơi (sửa: blur chỉ commit khi focus rời khỏi editor).

## Phase 38 — Tạo note từ template (New note from template) — FR-17 (issue #42)
- [x] M38.1 `web/src/lib/templates.ts` (thuần, không DOM/không server): `slugify` (bỏ dấu tiếng Việt
      gồm cả `đ`/`Đ`, gom ký tự lạ thành `-`, cắt 60 ký tự), `substituteTemplate` (`{{title}}`,
      `{{date}}`, `{{time}}`, `{{slug}}` + dạng chữ `YYYY-MM-DD-slug` xử lý **trước** `YYYY-MM-DD`),
      `findTemplatesFolder` (BFS, thư mục nông nhất tên `templates`), `listTemplates`,
      `targetCandidates` / `resolveTargetFolder` (`+s`, giữ nguyên tên, `y`→`ies`, `+es`, đoạn cuối sau
      gạch), `uniqueNotePath` (`-2`, `-3`…). 16 unit test trong `web/tests/templates.test.ts`.
- [x] M38.2 Store: `templatePicker` + `setTemplatePicker`; action `newFromTemplate(templatePath, title,
      folder)` đọc template bằng `api.read`, ghi **create-only** (`baseVersion: ''`) và nhảy hậu tố khi
      409, mở note, trả về path; từ chối title không ra slug và thư mục không tồn tại (không ghi gì).
      6 test trong `web/tests/store.test.ts`.
- [x] M38.3 UI: `web/src/components/TemplatePicker.tsx` (lọc template, Title, Folder luôn sửa được, dòng
      `Creates <path>` hiện trước khi ghi, lỗi hiện trong modal), nút ribbon `file-plus`, mục command
      palette "New note from template", CSS `.tpl-*` trong `obsidian.css`.
- [x] M38.4 Kiểm chứng: `npm test` **143 server + 127 web** PASS; `npm run typecheck` (4 workspace) PASS;
      `npm run build` PASS; **headless Chromium trên bản COPY của vault thật**: modal liệt kê đủ 9
      template, `meeting` → `Wiki/meetings`, tên dự đoán khớp file thật, note mở thành tab active, tên
      trùng → `-2` (file đầu không đổi), thư mục sai → "Folder not found" và không tạo thư mục; **0
      request lỗi, 0 pageerror/console error**; `deploy/smoke.sh` **7/7 PASS** trên server local.
- [x] M38.5 PR #44 → merge commit **6d86574**, deploy đã chứng minh: `https://webobsidian.digitalciapp.com/healthz`
      trả `{"ok":true,"version":"0.1.1","build":"6d86574"}`; bundle trong image đã deploy chứa chuỗi
      marker (`docker exec webobsidian grep -rl "New note from template" /app` → `index-BnoYvYat.js`, 3 lần —
      đúng bundle đã kiểm chứng headless ở M38.4); `/`, `/tasks` và deep link `/note/Wiki/reviews/...` đều 200;
      vault sau deploy: 9 template + 2 meeting nguyên vẹn, lint CLEAN.

## Phase 39 — Sửa lỗi Template picker: chọn bằng click, thư mục bắt buộc — FR-17 (issue #46)
- [x] M39.1 Bỏ `onMouseEnter` khỏi hàng template (hover trước đây đặt đúng state mà click đặt, nên hover đã
      chọn template và click trở nên vô nghĩa), bỏ template chọn sẵn, hàng chuyển thành `<button>` (click,
      focus, Enter/Space), thêm dòng `Template:` hiển thị lựa chọn, Enter trên hàng đang focus không tạo note.
- [x] M39.2 Thư mục **bắt buộc**: `canCreate` cần template + title + thư mục; dòng đường dẫn nói rõ lý do
      đang chặn; `newFromTemplate` từ chối thư mục rỗng (`A target folder is required.`) → gốc vault không
      bao giờ nhận note (trước đây `document`/`procedure`/`query`/`shift-handover` tạo được và ghi ra gốc).
- [x] M39.3 Kiểm chứng: `npm test` **143 server + 128 web** PASS (thêm 1 test store: thư mục rỗng → từ chối,
      không ghi gì); typecheck + build xanh; headless trên bản copy vault — mở modal **không hàng nào được
      chọn** + Create disabled, **hover không chọn** (`data-chosen` vẫn `false`), **click chọn** (folder +
      dòng lý do cập nhật), template không thư mục bị chặn kèm lý do, luồng meeting vẫn tạo
      `Wiki/meetings/<date>-<slug>.md` và mở note, trùng tên → `-2`, thư mục sai → `Folder not found`,
      **0 request lỗi, 0 pageerror**.

## Phase 40 — Popup nổi mount ngoài wrapper theme (chữ đen trên theme tối Catppuccin) — FR-18 (issue #49)
- [x] M40.1 Dựng lại lỗi bằng headless Chromium trên bản copy vault: `[[` + `Al` với 6 theme. Xác nhận
      `obsidian-light`/`obsidian-dark` đúng, còn **mọi theme Catppuccin** mount popup vào `BODY` → chữ
      `rgb(0,0,0)` trên nền trong suốt. Đối chiếu theme thật của vault production (`settings.json` trên
      LXC 107: `catppuccin-mocha`) → đúng ca người dùng báo.
- [x] M40.2 Thêm `themedRoot()` + `themedPopupHost()` vào `web/src/lib/theme.ts` (dùng `THEME_SELECTOR`
      dựng từ `THEME_CLASS`); `lib/cssColor.ts` import lại thay vì tự định nghĩa.
- [x] M40.3 Sửa 3 điểm mount: `lib/suggest.ts` (suggester `[[`/`#`), `lib/livePreview.ts` (dropdown giá trị
      property), `lib/plugins.ts` (`Notice`/`.toast`). Không còn `querySelector('.theme-light, .theme-dark')`
      trong `web/src`.
- [x] M40.4 Guard test `web/tests/themeHost.test.ts` (4 test): selector phủ đủ `THEME_CLASS`, cấm shortcut
      hai class, ba điểm mount phải dùng `themedPopupHost()` (không append vào `document.body`), nhánh
      fallback về `<body>`. Kiểm chứng **đỏ** khi revert `suggest.ts` (2 test fail), **xanh** sau khi sửa.
- [x] M40.5 Kiểm chứng: `npm run typecheck` sạch; `npm test` **149 server + 137 web** PASS; headless 6 theme
      — popup nằm trong wrapper, `background` và màu chữ **khớp biến palette** (`catppuccin-mocha`: nền
      `rgb(30,30,46)`, chữ `rgb(205,214,244)`), dropdown Properties từ `BODY`/trong suốt/đen →
      `div.theme-ctp-mocha`/`rgb(30,30,46)`/`rgb(205,214,244)`, 0 pageerror; ảnh chụp đọc lại bằng vision
      xác nhận chữ sáng trên nền tối; `deploy/smoke.sh` local 7/7 PASS.
- [x] M40.6 Docs cùng lượt: PRD 1.18 (FR-18), CHANGELOG `[Unreleased] › Fixed`, README thêm mục
      "Floating popups must mount inside the themed root".

## Phase 41 — Khoá ghi chú cho trình duyệt (vault locks) — FR-19 (issue #53, #54)
- [x] M41.1 Chốt thiết kế trong issue: khoá là middleware trên router **của phiên** (`/api/files`), không
      phải hệ quyền thứ hai — đường `/api/v1` của agent xác thực bằng API key nên không đi qua đó và vẫn
      ghi bình thường. Danh sách nằm trong vault (`_system/locks.json`) để đổi không phải deploy lại.
- [x] M41.2 `server/src/services/locks.ts`: parse + cache theo `mtime` (file thiếu/hỏng ⇒ khoá rỗng),
      `globToRegExp` (`**`, `*`, `?`, không phân biệt hoa/thường, escape ký tự regex), `lockFor`,
      `targetsOf` (gom `path`/`from`/`to`/`dir`/`paths` từ body + query) và `sessionMayWrite` cho ba chế
      độ `confirm`/`password`/`off`; `annotateTree` gắn cờ khoá cho cả cây bằng **một** lần đọc cấu hình.
- [x] M41.3 `server/src/routes/files.ts`: một middleware chặn ghi trên router phiên (trả `423 locked` kèm
      lý do), gắn `locked`/`lockReason` vào `GET /api/files` và `locked`/`lockReason`/`unlock` vào
      `GET /api/files/content`; `POST /upload` kiểm tra trong handler vì đường dẫn chỉ có sau multer.
- [x] M41.4 Web: `Icon` thêm glyph lock, `FileTree` hiện 🔒 kèm tooltip, `Editor` chuyển read-only bằng
      đúng cơ chế compartment đã dùng cho chế độ reading + banner nêu lý do, `lib/api.ts` giữ trạng thái
      mở khoá theo phiên và gửi header, `lib/store.ts` nhận cờ khoá khi mở note và bắt `423` khi lưu.
- [x] M41.5 Test: `server/src/services/locks.test.ts` (13 test) + `scripts/smoke-test.sh` scenario G.
- [x] M41.6 Node phủ xanh: PR #53 (kèm `docs/LOCKS.md`, README) → merge → deploy build `06860d4` live.
- [x] M41.7 Khoá luôn trên **container thật**: `deploy/smoke.sh` đăng nhập, đọc `_system/locks.json` qua
      cây file, ghi thử vào thư mục khoá đầu tiên tìm được rồi kiểm tra không còn dấu vết — PR #54.

## Phase 42 — Hai lỗi đường dẫn: note không tồn tại trả 500, daily note về sai thư mục — FR-20 (issue #52, #55)
- [x] M42.1 Assert của FR-19 ("lần ghi bị từ chối không để lại gì trên đĩa") bắt được lỗi: đọc lại đường
      dẫn thử nghiệm trả **500** thay vì **404** — deploy tự rollback, không có gì lọt ra người dùng.
- [x] M42.2 `server/src/routes/files.ts`: sau khi thử giải basename mà vẫn thiếu file ⇒ `404 not_found`.
- [x] M42.3 `web/src/lib/store.ts`: chọn thư mục `daily/` nông nhất trong cây thay vì hardcode `Daily/` ở
      gốc; chỉ rơi về `Daily/` gốc khi vault không có thư mục daily nào (issue #52) + `docs/DEPLOYMENT.md`.
- [x] M42.4 Kiểm chứng: `npm test` sạch; `scripts/smoke-test.sh` **31 PASS** (thêm assert `404 not_found`);
      deploy `b7233be` live, `deploy/smoke.sh` **10/10 PASS**; vault thật `wiki_lint` CLEAN sau khi adopt.

## Phase 43 — Xem file PDF: pane xem + embed `![[x.pdf]]` — FR-21 (issue #57)
- [x] M43.1 `web/src/lib/media.ts`: `fileViewKind()` (`canvas|image|video|audio|pdf|text`), `PDF_EXT_RE`,
      `IMAGE_EXT_RE`, `isAttachmentTarget()` — một nguồn cho file view, Reading/Preview và Live Preview.
- [x] M43.2 `Workspace.tsx`: pane PDF (`iframe.pdf-fileview` → `/api/files/content?path=…`) cho deep link,
      click trong cây file và wikilink; `EditorPane` dùng `fileViewKind()` thay các regex rời.
- [x] M43.3 `livePreview.ts`: `PdfEmbedWidget` cho `![[doc.pdf]]` (khung + tên file mở thành tab;
      `#page=…` không lọt vào query của file API).
- [x] M43.4 `markdown.ts` + `Preview.tsx`: link trơ `a.pdf-embed[data-href]` (href = URL file thật) rồi thay
      bằng iframe trong pass post-render — **không** nới schema rehype-sanitize; `expandEmbeds` bỏ qua PDF.
- [x] M43.5 `server/src/index.ts`: CSP `frame-ancestors 'none'` → `'self'` (app khung nội dung của chính nó;
      trước đó trình duyệt chặn khung và pane trống).
- [x] M43.6 `store.openWikilink`: target file đính kèm (ảnh/media/pdf) chưa giải được ⇒ `File not found: …`,
      không sinh note `report.pdf`.
- [x] M43.7 Test: `web/tests/media.test.ts`, `web/tests/markdown.test.ts` (mới) + 3 assert trong
      `store.test.ts`; `npm test` 148 PASS.
- [x] M43.8 `deploy/smoke.sh`: 4 assert mới (CSP `frame-ancestors 'self'`, deep link PDF trả SPA,
      `application/pdf` không `Content-Disposition`, range `206 %PDF-`) — chạy theo đường dẫn PDF tìm trong
      cây, không ghi gì; local 13/13 PASS.
- [x] M43.9 Kiểm chứng UI (bản sao vault, Chromium headed dưới Xvfb): deep link hiện đúng trang PDF, embed
      inline ở Live Preview và Preview, click cây file mở pane, deep link sống qua reload, không lỗi console,
      `[[documents/nope.pdf]]` không tạo note.

## Phase 44 — Tải file nhị phân từ vault: pane tải + `Content-Disposition` — FR-22 (issue #59)
- [x] M44.1 `server/src/services/mime.ts`: `attachmentDisposition(name)` — `attachment; filename="…"`
      (fallback ASCII, escape `"`/`\`) + `filename*=UTF-8''…` (RFC 5987) cho tên không ASCII.
- [x] M44.2 `server/src/routes/files.ts`: `?download=1` (nhận cả `download`, `download=true|yes`) ⇒ nhánh
      nhị phân của `GET /api/files/content` gửi kèm `Content-Disposition` với basename thật của file.
- [x] M44.3 `web/src/lib/media.ts`: `DOWNLOAD_EXT_RE` (docx/xlsx/pptx/odt/ods/odp/rtf/nén) + `FileViewKind`
      thêm `attachment`; `extLabel()` cho câu chữ trong pane.
- [x] M44.4 `web/src/lib/api.ts` `downloadUrl()` + `Workspace.tsx` pane tải (tên file + nút Download);
      `Icon.tsx` thêm icon `download`; `obsidian.css` khối `.attachment-*`.
- [x] M44.5 Test: `server/src/services/mime.test.ts` (mới, 6 case) + 5 assert mới trong
      `web/tests/media.test.ts`; server **168 PASS**, web **149 PASS**, `npm run typecheck` 4 workspace sạch.
- [x] M44.6 Kiểm chứng trên instance thật (LXC 107): bấm file `.pptx` trong vault ⇒ trình duyệt **tải**
      file, tên lưu đúng `operations-documentation-system-2026-09-27.pptx`, sha256 khớp bản build
      (`fd0aaf87…`), file là zip hợp lệ (`PK`); PDF vẫn `200 application/pdf` inline, range `206` — không
      đổi hành vi FR-21.

## Phase 45 — Danh sách giá trị cho thuộc tính đóng: nút ▾ + list (`status`/`priority`/…) — FR-23 (issue #61)
- [x] M45.1 `web/src/lib/propOptions.ts` (mới, thuần logic, không phụ thuộc DOM): bảng `PROP_PICK_LISTS`
      theo từ vựng của `relats/SCHEMA.md` — `priority` (P1–P3), `origin`, `confidence`, `severity`; riêng
      `status` **theo loại trang** (`STATUS_BY_TYPE`): `task` (open / in-progress / waiting / blocked /
      done / dropped), `abnormality` (open / contained / countermeasure-agreed / verified / closed),
      `document` (open / acted / archived) — status của task **không phải** status của abnormality, nên
      loại trang không có từ vựng (`system`, `entity`, …) thì **không** hiện picker thay vì hiện sai danh
      sách. `hasPickList(key, type)` / `pickListFor(key, type)` (khớp key sau khi trim và bỏ hoa-thường)
      và `optionsFor(key, current, type)` trả option kèm cờ `current` / `offList`. **Giá trị lạ luôn được
      giữ nguyên, đứng đầu danh sách và gắn cờ**; giá trị rỗng không thêm option nào (xoá là việc của nút
      × của hàng).
- [x] M45.2 `web/src/lib/livePreview.ts`: `makeScalarField(dt, value, key, type)` nhận thêm `key` và
      loại trang (`pageKind()`, đọc từ chính YAML của block) để chọn đúng từ vựng status; nhánh text
      của khoá có pick-list bọc field trong `.prop-val-wrap` và thêm nút `.prop-pick-btn` (`▾`,
      `aria-haspopup="listbox"`); `openPickList()` mount list vào **`themedPopupHost()`** bằng đúng các
      class sẵn có (`.cm-props-dropdown.prop-val-dropdown`, `.cm-props-dd-item`) nên palette của theme
      resolve, chọn xong ghi qua `mutate()` — đúng **một** dòng frontmatter đổi; Escape và click ra
      ngoài đóng list. `setType` dựng lại cả ô giá trị thay vì `replaceChild` vào field (field có thể
      nằm trong wrapper).
- [x] M45.3 `web/src/styles/obsidian.css`: `.prop-val-wrap`, `.prop-pick-btn` (+ hover/focus) và nhãn
      `current` cho option off-list.
- [x] M45.4 Không đụng phần còn lại: `lib/tasks.ts` (id canonical + alias của board) và menu *Property
      type* giữ nguyên; không thêm tham số server/index nào — từ vựng nằm trong code client, app chỉ
      ghi lại giá trị người dùng chọn.
- [x] M45.5 Test: `web/tests/propOptions.test.ts` (mới, 10 case: từ vựng đúng và đúng thứ tự, không
      trùng giá trị, key không có list, khớp key/loại trang không phân biệt hoa-thường/khoảng trắng, giá
      trị đang dùng được đánh dấu, **giá trị lạ giữ nguyên và đứng đầu**, giá trị rỗng, `status` theo loại
      trang — `abnormality`/`document` có danh sách riêng, `system`/`entity`/không type thì không có, và
      cùng một chuỗi (`countermeasure-agreed`) là off-list trên task nhưng canonical trên abnormality).
      `npm run typecheck` 4 workspace sạch; `npm test` server **168 PASS**, web **159 PASS** (thêm 10 case).
- [x] M45.6 Kiểm chứng UI (Chromium headless qua `/snap`, instance tạm trên **bản sao** vault thật — không
      chạm vault LXC 107): **26 PASS, 0 FAIL** — nút ▾ có ở `status`/`priority`, không có ở `title`/`due`;
      list đúng 6 giá trị theo thứ tự SCHEMA, giá trị hiện tại được ✓ đúng một lần; chọn `in-progress`
      ghi `status: in-progress` xuống file với đúng một dòng `status:` và **phần còn lại byte-identical**
      (kể cả khối `Update:` người dùng tự gõ); reload giữ giá trị mới và list đánh dấu lại; **abnormality
      page thật** hiện đúng 5 giá trị của abnormality, ✓ `contained`, không lẫn status của task; **task có
      status ngoài bảng** (`wip-ish`) giữ nguyên, đứng đầu, gắn cờ, **không** bị ghi lại; note `type:
      system` (ADR, `status: accepted`) **không** hiện picker và giữ nguyên text; console/pageerror rỗng.
      `bash deploy/smoke.sh` trên instance tạm: **17 PASS, 0 FAIL**.

### Nhật ký tiến độ
- 2026-10-29: Rendering audit — reproduced mixed HTML/literal loss, code/escaping violations, embed/attachment errors and cross-mode differences. Saved the proposed compatibility plan; production code unchanged during analysis.
- 2026-10-29: FR-2 — fixed literal `<LS_BEN>` disappearing in Live/Reading HTML replacements, including standalone text, lists and quotes, without changing note source. Strict tag-name recognition retains ordinary HTML; hidden Electron regressions verified before/after the fix. Full tests, typecheck, build and disposable integration smoke pass.
- 2026-09-30 (Phase 45 — danh sách giá trị cho thuộc tính đóng, FR-23, issue #61): người dùng nói "the
  task will be selection list, to easy select status". Trên trang task, `status:` là text tự do nên đổi
  trạng thái phải gõ đúng id — mà gõ sai thì **không vô hại**: board chỉ map id canonical + vài alias,
  giá trị lạ thành một cột riêng và **không bao giờ** bị sửa lại khi đọc. Thêm bảng từ vựng thuần logic
  (`web/src/lib/propOptions.ts`, theo `relats/SCHEMA.md`; `status` theo loại trang — task / abnormality /
  document có từ vựng riêng, loại trang không có từ vựng thì không hiện picker) + nút `▾` cạnh giá trị mở
  list (mount qua
  `themedPopupHost()` như suggester sẵn có), chọn xong ghi qua `mutate()`. Nguyên tắc giữ nguyên: field
  vẫn là text sửa được, giá trị lạ **được giữ, đứng đầu, gắn nhãn** — không chuẩn hoá ngầm, không chặn
  `waiting`/`dropped`. Verify: `npm run typecheck` 4 workspace; server 168 / web 157 PASS; Chromium
  headless trên bản sao vault thật 26/26 (chọn `in-progress` ⇒ file đổi đúng một dòng `status:`, phần
  còn lại byte-identical, reload giữ giá trị mới; abnormality page hiện từ vựng riêng, không lẫn status
  của task; `status: accepted` trên ADR `type: system` không hiện picker và giữ nguyên text);
  `deploy/smoke.sh` 17/17 trên instance tạm.
- 2026-09-27 (Phase 44 — tải file nhị phân từ vault, FR-22, issue #59): người dùng báo "the pptx needed to
  be downloaded from 107". Truy vết: file `.pptx` phục vụ đúng (`200`, 47.490 byte, sha256 khớp) nhưng
  **không có đường lấy ra dùng được** — mọi loại không có viewer rơi vào editor markdown, và URL duy nhất
  phục vụ file (`/api/files/content?path=…`) khiến trình duyệt lưu thành `content` không phần mở rộng
  (kiểm chứng bằng Playwright: sự kiện download bắn ra, `suggested_filename = "content"`). Sửa hai đầu của
  cùng một seam: server gửi `Content-Disposition` khi có `?download=1`, client thêm pane tải cho nhóm
  tài liệu/nén qua `fileViewKind` (nhánh PDF của FR-21 không đổi). Kiểm chứng: server 168 PASS, web 149
  PASS, typecheck 4 workspace sạch; Playwright (Chromium headed, Xvfb) trên vault 107 tải đúng tên file và
  sha256 khớp bản build; PDF vẫn inline + range 206.
- 2026-09-27 (Phase 43 — xem file PDF, FR-21, issue #57): người dùng báo "I cannot view PDF file on this
  link" cho `documents/2026-09-27-top-5-hoshin-articles-lei.pdf`. Truy vết: file phục vụ đúng
  (`application/pdf`, Range 206, sha256 khớp) — thiếu hoàn toàn **đường xem**: `EditorPane` không có nhánh
  PDF nên deep link/click cây file mở tab editor trống. Thêm `fileViewKind()` làm một nguồn cho cả ba đường
  render, pane PDF là iframe; `![[x.pdf]]` render inline ở Live Preview và ở Preview (link trơ + pass
  post-render, schema sanitize không nới). Kiểm tra headless phát hiện thêm lỗi thật: CSP
  `frame-ancestors 'none'` khiến trình duyệt từ chối khung chính app (`Framing … violates frame-ancestors
  'none'`) ⇒ đổi sang `'self'`. Nhân đây bịt lỗi gõ sai link file đính kèm sinh note rác. Kiểm chứng:
  `npm test` 148 PASS; Chromium headed (Xvfb) trên bản sao vault thấy đúng trang PDF cả ở pane và ở embed;
  `deploy/smoke.sh` 13/13 PASS (thêm assert CSP + file PDF).
- 2026-09-26 (Phase 42 — hai lỗi đường dẫn, FR-20): assert mới của Phase 41 trên container thật bắt được
  `GET /api/files/content` trả **500** khi note không tồn tại (route giải basename rồi vẫn đọc tiếp ⇒ ENOENT
  thành 500); deploy đã tự rollback nên không lộ ra ngoài. Thêm nhánh `404 not_found` sau bước giải
  basename, và thêm assert `404 not_found` vào scenario G. Lỗi thứ hai (issue #52) đã sửa cùng ngày: lệnh
  daily note hardcode `Daily/<iso>.md` ở gốc vault nên sinh file rác ở gốc cho vault này (daily note nằm ở
  `relats/daily/`); nay chọn thư mục `daily/` nông nhất trong cây. Kiểm chứng: `npm test` sạch,
  `scripts/smoke-test.sh` 31 PASS, deploy `b7233be` 10/10 PASS.
- 2026-09-26 (Phase 41 — khoá ghi chú cho trình duyệt, FR-19, issue #53/#54): yêu cầu từ người dùng —
  "có file markdown sửa được, có file không; viết hàm khoá để em không sửa nhầm, và hiện icon/trạng thái
  cho em biết". Nhận ra app đã tách sẵn hai đường ghi (cookie phiên vs API key) nên khoá chỉ cần chặn
  **một** đường: `_system/locks.json` khai báo glob + lý do, phiên nhận `423 locked`, agent vẫn ghi — đúng
  ý người dùng ("anh sửa được, em thì không"). Ba chế độ mở khoá (`confirm`/`password`/`off`), mặc định
  `confirm` để khoá không trở thành ngõ cụt. 13 unit test + scenario G phủ cả ca quan trọng nhất: **key
  của agent ghi được note đang bị khoá**. Live: build `06860d4` rồi `b7233be`, 58 đường dẫn bị khoá trong
  vault thật, `deploy/smoke.sh` khẳng định lại sau mỗi lần deploy.

- 2026-09-26 (Phase 40 — popup gợi ý `[[` chữ đen trên theme tối, issue #49): người dùng báo gõ `[[` thì
  chữ trong danh sách gợi ý hiện màu đen khi ở dark mode. Dựng lại bằng headless: theme thật của vault
  production là `catppuccin-mocha`, và **chỉ** bốn theme Catppuccin lỗi — `obsidian-light`/`obsidian-dark`
  vẫn đúng. Nguyên nhân: hai nơi mount popup tìm wrapper bằng `document.querySelector('.theme-light,
  .theme-dark')`, thiếu `theme-ctp-*`, nên popup rơi vào `<body>` — ngoài phạm vi khai báo biến palette →
  `.suggestion-title` về màu đen mặc định, nền popup trong suốt (đo được: cha `BODY`, chữ `rgb(0,0,0)`,
  nền `rgba(0,0,0,0)`). Sửa bằng một helper `themedPopupHost()` (`lib/theme.ts`, dùng `THEME_SELECTOR` từ
  `THEME_CLASS`; `themedRoot()` chuyển từ `lib/cssColor.ts` về đây) và áp cho cả ba chỗ mount popup —
  suggester `[[`/`#`, dropdown giá trị Properties, toast của plugin (lightbox không đọc biến palette nên
  giữ nguyên). Guard test `web/tests/themeHost.test.ts` (4 test) chặn shortcut hai class quay lại, đã thấy
  **đỏ** khi revert `suggest.ts` và **xanh** sau khi sửa. Kiểm chứng: typecheck sạch, `npm test` 149 server
  + 137 web PASS, headless 6 theme (popup trong wrapper, nền + màu chữ khớp biến palette; mocha nền
  `rgb(30,30,46)` chữ `rgb(205,214,244)`), dropdown Properties trước/sau đo được, ảnh chụp đọc lại bằng
  vision, `deploy/smoke.sh` 7/7. Docs: PRD 1.18 + FR-18, Phase 40, CHANGELOG, README (mục "Floating popups
  must mount inside the themed root"). Tách riêng: mermaid dùng `querySelector('.theme-dark')` làm cờ "đang
  tối" nên render sai theme trên Catppuccin — issue #50.
- 2026-09-26 (Phase 17 — review bản production theo yêu cầu người dùng): dùng thử
  https://webobsidian.digitalciapp.com bằng Playwright (desktop 1440px + iPhone 13) và sửa 11 điểm:
  bảng bẻ chữ giữa từ (`.cm-lineWrapping` đặt `overflow-wrap: anywhere` + bảng bị ép theo độ rộng dòng —
  nay cuộn ngang trong `.cm-table-scroll`, `.cm-content` được co `min-width: 0` để bảng rộng không kéo giãn
  cả cột trên mobile); rate limit login dùng chung một bucket sau cloudflared → thêm `CLIENT_IP_HEADER`;
  WS không reconnect + không ping (Cloudflare cắt sau ~100s rảnh) → reconnect/heartbeat/426; Tasks board
  cột cuối bị cắt; graph nhãn chồng + mở ra bị cắt → fit một lần + declutter; inline title trùng H1 → setting;
  Recent trùng tên; snippet search lộ Markdown; login loé theme sáng; chặn pinch-zoom; asset chỉ cache 4h.
  Kiểm chứng: typecheck + toàn bộ test (server 149, web 133 kể cả test mới `ratelimit`/`snippet`), build, chạy
  server local với vault thử và chụp màn hình từng điểm (bảng desktop/mobile, login tối, Recent có thư mục,
  snippet sạch, graph fit + nhãn không chồng, Tasks), `GET /ws` → 426, `/assets/*` →
  `max-age=31536000, immutable`, WS open→close→open qua lần restart server. **Việc cần làm trên LXC 107**:
  thêm `CLIENT_IP_HEADER=CF-Connecting-IP` vào `/root/webobsidian/.env`.
- 2026-09-26 (FR-17 — sửa lỗi chọn template, issue #46): người dùng báo "hover được vào template nhưng
  click không chọn được". Dựng lại bằng headless: đúng — `onMouseEnter` đặt **cùng** state mà click đặt,
  nên hover đã chọn template, còn template đầu danh sách (`abnormality`) thì được chọn sẵn; cú click không
  còn gì để làm nên trông như chết. Nhân lúc dựng lại phát hiện lỗi nặng hơn: 4 template không suy ra được
  thư mục (`document`, `procedure`, `query`, `shift-handover`) vẫn tạo được và **ghi note ra gốc vault**,
  vì `canCreate` không xét thư mục và guard trong store là `if (dir && …)`. Đã sửa: hover chỉ còn hiệu ứng,
  chọn bằng click (hàng là `<button>`, có Tab + Enter/Space), không chọn sẵn template nào, thêm dòng
  `Template:` và dòng lý do chặn; thư mục **bắt buộc** ở cả UI và store. **Kiểm chứng**: `npm test` 143
  server + 128 web PASS; headless xác nhận hover không chọn / click chọn / template không thư mục bị chặn /
  luồng meeting + `-2` + thư mục sai vẫn đúng, 0 request lỗi, 0 pageerror.
- 2026-09-26 (FR-17 — Tạo note từ template, issue #42): người dùng hỏi "khi họp tôi phải copy 1 file từ
  template sang thư mục meetings rồi sửa, có cách nào tốt hơn không". Kiểm tra trước khi trả lời: app
  **không có** tính năng template (lệnh "Open today's daily note" hardcode `Daily/<iso>.md` và không biết
  `Wiki/`), và shim plugin **không thể** chạy Templater (`addCommand`/`registerView`/`loadData`/`saveData`
  là no-op) → không có cách nào "bật" template, phải viết vào app. Quyết định (ghi ở PRD FR-17): **một
  lệnh dùng chung** cho mọi template, thư mục template tự dò, thư mục đích suy từ tên template và **hiện
  trước khi ghi**, placeholder thay cả dạng chữ vault đang dùng (nên không phải migrate template), tên
  trùng thì `-2` và **không bao giờ ghi đè**, thư mục thiếu thì báo lỗi chứ không tự tạo. **Kiểm chứng**:
  `npm test` 143 server + 127 web PASS (+16 template, +6 store), typecheck 4 workspace PASS, build PASS, headless
  Chromium trên bản copy vault thật PASS toàn bộ (9 template liệt kê đúng, `meeting`→`Wiki/meetings`,
  `sources: [raw/meetings/2026-09-26-qms-review-with-ban-and-chien.md]` — token ghép không để lại `-slug`,
  trùng tên → `-2` mà file đầu nguyên vẹn, thư mục sai → "Folder not found"), `deploy/smoke.sh` 7/7. Phát
  hiện phụ khi kiểm chứng: restore workspace state của app gây **500** khi tab cũ trỏ vào file đã bị xoá
  trên đĩa (lỗi có sẵn, không liên quan FR-17) — ghi lại để xử lý riêng.
- 2026-09-26 (FR-15 — Tasks view: đặt hạn từ board/timeline, issue #41): người dùng hỏi vì sao nhiều task
  không có hạn và làm sao thêm — 5/9 note `due: none`. Chọn hướng "làm chức năng" + sửa template. Quyết
  định (PRD FR-15): badge hạn thành control mở `<input type="date">` tại chỗ, menu `⋯` có "Set due date…";
  ghi bằng `setTaskDue` (tách chung một hàm phẫu thuật frontmatter với `setTaskStatus`), CAS `baseVersion`;
  chip "Needs a due date" lọc task chưa hạn; template đổi sang `due: YYYY-MM-DD` + quy ước, SCHEMA nói
  `due` bắt buộc và `none` là ngoại lệ cố ý; skill trích xuất action-item vẫn **không bịa ngày** nhưng phải
  ghi `due: none` để việc thiếu hạn hiện ra thay vì im lặng. **Kiểm chứng**: `npm test` 143 server + 105
  web (9 test mới); typecheck + build xanh; headless **63/63 PASS** — trong đó 12 check đọc thẳng file
  trong vault để chứng minh chỉ `due:`/`updated:` đổi; template + SCHEMA đã ghi vào vault thật và đọc lại
  xác nhận. M37.1–M37.5 `[x]`.
- 2026-09-25 (FR-15 — Tasks view: lọc theo trạng thái, mặc định ẩn Done, issue #39): người dùng yêu cầu
  thêm chức năng lọc theo trạng thái và mặc định không hiện Done. Quyết định khung (ghi ở PRD FR-15):
  chip theo trạng thái kèm số thẻ ở hàng riêng; mặc định chỉ ẩn `done`, giá trị lạ vẫn hiện; **cột Done
  vẫn được vẽ dù thẻ bị ẩn** vì nếu bỏ cột thì không còn chỗ thả để hoàn thành task — header ghi
  `+N hidden`; hàng lọc ghi `N hidden — show all` để không có gì bị ẩn âm thầm. Hàm thuần mới trong
  `web/src/lib/tasks.ts` + 4 test. **Kiểm chứng**: `npm test` 143 server + 96 web; headless DOM **51/51
  PASS** (thêm 5 check cho bộ lọc, gồm bật/tắt Done đổi số thanh 9↔10 và cột Done giữ chỗ thả);
  ảnh chụp light/dark/board đã soi lại. M36.1–M36.3 `[x]`.
- 2026-09-25 (FR-16 — Timeline: cửa sổ 8 tuần theo bề rộng, issue #37): người dùng yêu cầu "trong
  timeframe Week muốn thấy task của ít nhất 8 tuần tới, tuỳ kích thước màn hình". Đo trước khi sửa:
  ở 16px/ngày cố định thì 1440px → 10.6 tuần, nhưng 1000px (mở cả hai sidebar) → **4.4 tuần**, 390px →
  **2.3 tuần** — đúng chỗ người dùng phàn nàn. Đã làm: `weekZoomPxPerDay(usableW)` = `clamp(usable /
  (56/0.88), 4, 20)` với 12% bề ngang giữ phía sau hôm nay (hôm nay nằm gần mép trái vì phần đáng xem là
  phía trước), `computeRange` mở rộng tới **hôm nay + 56 ngày** luôn, nhãn tuần đổi định dạng theo mật
  độ (`Sep 14` ↔ `14`), cột nhãn compact theo bề rộng **pane** chứ không theo viewport (cửa sổ 1000px
  pane chỉ ~404px mà cột vẫn 200px), Month zoom hạ còn 3px/ngày để thứ tự zoom không đảo sau khi sàn
  Week hạ xuống 4, và chip "N weeks ahead" trên thanh công cụ để thấy ngay chế độ này chạy. **Kiểm
  chứng**: `npm test` 143 server + 92 web (25 test thuần); headless DOM **42/42 PASS** — trong đó có
  assertion mới đo **số tuần phía trước đang nằm trong màn hình** ở ba bề rộng: 1440px → **8.0**,
  1000px (cả hai sidebar) → **8.0**, 390px → **8.0** tuần, kèm khớp định dạng nhãn (`Aug 3` khi rộng,
  `03` khi dày) và hình học thanh vẫn khớp kỳ vọng Python độc lập. M35.13–M35.16 `[x]`.
- 2026-09-25 (FR-16 — Timeline/Gantt restyle, issue #35): người dùng báo "gantt chart UI too ugly".
  Thay vì đoán, **chụp ảnh bằng headless Chromium** (light/dark/mobile) rồi **soi từng ảnh** để chấm
  thiết kế — vòng lặp: chụp → nhận xét → sửa → chụp lại. Vấn đề xác nhận được: lưới là "sương mù"
  gradient mỗi ngày (không đọc được tỉ lệ), trục 1 tầng nhãn `09-28`, thanh phẳng chữ chật, quá hạn chỉ
  có viền mảnh, trạng thái chỉ dựa vào màu, không có nhịp ngang cho hàng. Đã làm: trục 2 tầng (dải
  tháng + tick), nhãn `Sep 28`, nền cuối tuần, lưới phân cấp 3 mức, thanh bo góc + chip priority + tên
  task trong thanh, bar mở mờ dần, quá hạn viền + sọc, nhãn `Today` trên dải hôm nay, cột nhãn có
  bóng đổ và **nêu trạng thái bằng chữ**, compact ≤640px (cột nhãn 132px, meta rút gọn, ẩn tên task
  trong thanh). **Bug thật do kiểm chứng bắt được**: `scrollToToday()` chạy lúc `tasks` còn rỗng →
  dải 31 ngày vừa khung nên `scrollLeft` kẹp về 0, và callback giữ `lineX` cũ → **đường hôm nay nằm
  ngoài màn hình** (ảnh chụp nói đúng, test cũ nói sai vì chỉ so `offsetLeft`). Sửa: effect phụ thuộc
  `[lineX, pxPerDay]`, observe container **và** grid, nhường người dùng khi họ tự cuộn/đổi zoom; test
  DOM mới khẳng định đường hôm nay phải **trong vùng nhìn thấy** + có tự cuộn. **Kiểm chứng**: `npm test`
  143 server + 90 web (23 test thuần cho helper mới + 6 test DOM mới); typecheck + build xanh; headless
  DOM **32/32 PASS** (hình học từng thanh vẫn khớp kỳ vọng Python độc lập; thêm kiểm tra dải tháng, nền
  cuối tuần, nhãn Today, dải hôm nay, hairline ngày, trạng thái bằng chữ, cuộn ngang 390px); tương
  phản chữ/thanh đo được thấp nhất **4.70:1** (≥4.5:1 ở cả hai theme). M35.8–M35.12 `[x]`; M35.6 (deploy
  của #32) cũng đã tick; M35.7 chờ người dùng nhìn bằng mắt trên deployment thật.
- 2026-09-25 (FR-16 — Tasks view: Timeline/Gantt, issue #32): **Phase 35**. Bối cảnh: phiên Claude Code
  (opus) hết hạn mức giữa lúc lập plan nên phần code do agent dự phòng làm tiếp, nhánh
  `feat/tasks-gantt-timeline` từ `main` (đã có FR-15). Quyết định khung (ghi ở PRD FR-16): thanh
  `raised`→`due` không thêm field frontmatter nào; module thuần `web/src/lib/gantt.ts` tính trên **chỉ
  số ngày UTC** để DST/múi giờ không làm lệch ngày; dải tự fit + pad 3 ngày, luôn chứa hôm nay; độ dài
  thanh bao gồm cả hai đầu + floor 8px; đường hôm nay đánh dấu *đầu* ngày hôm nay. **Hai bug thật do
  kiểm chứng DOM phát hiện và đã sửa**: (1) `urlsync` là nơi duy nhất ghi URL và dựng URL từ `activePath`,
  nên `/tasks?mode=timeline` bị ghi đè thành `/tasks` lúc restore → **rơi âm thầm về board**; sửa bằng
  `pathToUrl(path, tasksMode)` + `modeFromUrl` (URL là nguồn sự thật lúc load) và test hồi quy reload;
  (2) persist `tasksMode` trong `PERSIST_KEYS` làm state khôi phục (`board`) đè mode URL yêu cầu → bỏ
  persist. Nhãn dòng được đổi thành `<button>` (mở note) vì đó là vùng chạm lớn nhất trên mobile.
  **Kiểm chứng**: `npm test` xanh (16 test gantt + 4 test URL/store mới); typecheck + build xanh; server
  trên vault fixture (6 note thật + 4 fixture biên): 22/22 check DOM PASS, gồm so hình học từng thanh với
  kỳ vọng Python độc lập, zoom Day/Week/Month (2880/1152/288 px), reload giữ timeline, 390px cuộn ngang.
  M35.1–M35.5 `[x]`; M35.6 (deploy) + M35.7 (kiểm tra bằng mắt) chờ merge. Đồng thời tick **M34.11**:
  FR-15 đã deploy thật (`build=a1158ad`, 6 task thật qua `/api/v1/tasks`).
- 2026-09-25 (FR-15 — Tasks view: Kanban board trên ghi chú `type: task`, issue #31): mở **Phase 34**
  theo plan 2 workstream song song (server: `server/**` + `deploy/smoke.sh` + `docs/AGENT_API.md`; web:
  `web/**`) cộng workstream docs (PRD/PLAN/CHANGELOG/README) chạy song song trong cùng phiên. Quyết định
  khung (ghi ở PRD FR-15): 2 module thuần song sinh `server/src/services/tasks.ts` +
  `web/src/lib/tasks.ts` cùng bảng canonical/alias; 4 cột chuẩn `open/in-progress/blocked/done`, giá trị
  lạ → cột riêng, thiếu `status` → Backlog + dấu chấm; QMD index (`search.ts`) tính sẵn `TaskRecord` khi
  `toDoc` để `GET /api/tasks` + `GET /api/v1/tasks` (scope `read`) không quét lại vault mỗi request;
  compare-and-set tuỳ chọn (`version`/`baseVersion`) thêm vào `GET`/`PUT /api/files/content` mà không
  đổi hành vi autosave cũ; điều hướng theo khuôn `graph://view` (`tasks://view` + `openTasks()`,
  `/tasks?mode=board|timeline`, Timeline ẩn ở phần 1, để dành cho FR-16/#32). Code review 2 trục
  (standards + spec) sửa thêm: CAS khi file đã mất → 409 (không hồi sinh note), twin server/web trim
  status giống nhau, quote giá trị YAML dễ hiểu nhầm (`yes`/`null`/số), rollback chỉ thẻ vừa kéo, thả vào
  chính cột hiện tại không ghi, `isViewPath()` cho các view ảo; và **map task không persist** — boot
  sau `restore()` quét vault 1 lần (`refreshTasks()`) vì index persist chỉ ghi khi build đầy đủ (restart
  sẽ hiện trạng thái cũ). **Kiểm chứng**: `npm test` 143 server + 64 web xanh (test mới đỏ trên
  `origin/main`); typecheck + build xanh; server chạy trên bản sao vault fixture (6 note `Wiki/tasks/` +
  2 fixture): `GET /api/tasks` 8 bản ghi (template bị loại), 401 khi thiếu session, từng filter lọc
  đúng; `GET /api/v1/tasks` 401 thiếu key / 403 thiếu scope `read` / 200; `changeTaskStatus` thật →
  `git diff` vault chỉ đổi `status:` + `updated:` (thiếu key → chèn sau `type:`), `baseVersion` cũ →
  409; trình duyệt headless: cột/đánh dấu/đỏ quá hạn đúng, kéo thả ghi file, PUT lỗi → thẻ về cột cũ +
  toast, cuộn ngang ở 390px, dark theme; `deploy/smoke.sh` 7/7 PASS; sửa note lúc server tắt → board
  đúng sau restart. M34.1–M34.10 `[x]`; M34.11 (deploy LXC 107) chờ merge.
- 2026-09-25 (FR-2 — dark mode: caret đen trên nền tối): báo cáo "đổi sang dark mode thì con trỏ màu
  đen, khó thấy". Nguyên nhân: `drawSelection()` ẩn caret gốc (`caret-color: transparent !important`)
  và tự vẽ `.cm-cursor`, màu border bị CodeMirror hard-code là `black`; biến thể `&dark` chỉ bật khi
  facet `darkTheme` được set — app theme bằng CSS variable nên facet không bao giờ bật → caret luôn
  đen. Sửa: `.cm-editor .cm-cursor, .cm-editor .cm-dropCursor { border-left-color: var(--text-normal) }`.
  Phát hiện cùng nguyên nhân: panel Find & Replace (`Ctrl+F`, `.cm-panels`) cũng là hộp sáng
  `#f5f5f5` + input trắng mặc định của browser trên UI tối → theme lại panel/input/nút theo palette.
  Kiểm chứng bằng browser thật (CDP, computed style + screenshot): Obsidian Dark caret `#dadada`
  trên nền `#1e1e1e` (trước: `#000`), light `#222222` trên trắng, Catppuccin Mocha `#cdd6f4`;
  panel dark giờ `rgb(38,38,38)` / chữ `#dadada`, light `#f6f6f6`, ctp-mocha `#181825`.
  Guard: `web/tests/editorTheme.test.ts` (fail nếu để màu literal thay vì biến palette).
- 2026-09-25 (FR-2 — click vào dòng nào caret phải ở dòng đó): bug "click 1 dòng nhưng con trỏ/ô sửa nhảy
  xuống 1-2 dòng dưới". Nguyên nhân: CodeMirror dựng **height map** từ border-box rect của các block và
  coi chúng xếp liền nhau, nên khoảng trắng do `margin` dọc giữa hai block **không** vào map → map ngắn
  hơn DOM (đo được: title + properties + table làm map thiếu 76px) → mọi click phía dưới rơi xuống 1-2
  dòng. Sửa: chuyển khoảng cách dọc của các block widget (`.cm-inline-title`, `.cm-properties` qua
  `FrontmatterWidget.toDOM` shell, `.cm-table-wrap`, `.cm-html-preview`, `.cm-html-block`, `.cm-mermaid`)
  từ `margin` sang `padding`; `.cm-table-wrap` đổi `inline-block` → `display:block; width:fit-content`
  (line box ẩn của inline-block thêm ~7px vô hình với map). Thêm `mediaLoadRemeasure` (ảnh/iframe load
  sau khi CM đo → re-measure, trước đây map thiếu đúng chiều cao ảnh) + guard: test CI
  `web/tests/editorSpacing.test.ts` (fail nếu tái xuất margin dọc trên block của editor) và
  `livePreviewGeometryGuard` (chỉ dev, warn khi map ngắn hơn nội dung render). Kiểm chứng trên Chromium
  thật (dev instance, CDP): 60/60 click đúng dòng (trước khi sửa 17/22 click lệch 1 dòng), mọi note
  isolation cho map == DOM, layout các block khác không đổi 1px. Ghi lại quy ước ở README › *Live Preview
  geometry* + CONTRIBUTING (CLAUDE.md không sửa được trong phiên này: file agent-instruction bị chặn ghi).
- 2026-09-20 (FR-9 — build identity + deploy truthfulness): câu hỏi "đang chạy version nào?" giờ trả lời
  được bằng 1 lệnh. `/healthz` trả `{ok, version, build}` với `version` đọc từ `package.json` gốc và
  `build` là commit nhúng lúc build (`--build-arg GIT_SHA` → `ENV WEBOBSIDIAN_BUILD_SHA`, `dev` nếu build
  ngoài pipeline). Phát hiện kèm sửa một lỗi thật: **deploy có thể rebuild image mà container cũ vẫn
  chạy** — `docker compose up -d` không luôn recreate khi chỉ nội dung image đổi, và smoke test không
  phát hiện được vì container cũ trả lời đúng các endpoint đó (đúng tình trạng trên 107: container vẫn
  chạy image build từ lúc bootstrap trong khi tag `latest` đã được build lại 5 lần). Thêm
  `ensure_running_image()` so image id container với image vừa build → `--force-recreate` khi lệch, và
  **fail deploy nếu sau đó vẫn không khớp**; smoke test assert `build` == commit vừa deploy. Thêm mục
  "Which version is running, and how to verify it" trong `docs/DEPLOYMENT.md` (curl /healthz, docker
  inspect image id, log GitHub Actions, và marker nhìn thấy trên UI: Catppuccin themes, preview tab,
  graph touch, `/auth/status` không còn `mustChangePassword`).
- 2026-09-20 (FR-9 — deploy pipeline LXC 107 + CI/CD deploy-on-merge): bản fork được deploy vào LXC 107
  thay cho bản upstream. **Sửa bug healthcheck**: probe dùng `localhost` → trong image alpine resolve
  ra `::1` còn server chỉ bind IPv4, `wget` không fallback nên probe fail mãi (3000+ lần) và container
  báo `unhealthy` dù API phục vụ bình thường — nay `docker-compose.yml` và `Dockerfile` đều probe
  `127.0.0.1`. Thêm `deploy/deploy.sh` (idempotent: sync → backup rolling 1 bản → tag image cũ thành
  `webobsidian:rollback` → build → `up -d` → chờ healthy → `deploy/smoke.sh`; fail ở bất kỳ bước nào
  thì tự retag + `up -d` về image cũ), `deploy/smoke.sh` (assert `/healthz`, SPA bundle,
  `/auth/status` **chỉ** có `passwordSet` — dấu hiệu bản fork đang chạy, `123456` bị từ chối khi đã có
  credential, password operator login được; không in secret) và `.github/workflows/deploy.yml`
  (tự deploy sau khi CI xanh cho push vào `main`, kiểm tra `workflow_run.event == 'push'` để PR từ fork
  không chạm runner, thêm `workflow_dispatch`, `concurrency` để deploy không chồng nhau, chạy trên
  self-hosted runner trong chính LXC vì LXC nằm sau NAT). Migrate giữ nguyên vault bind
  `/root/obsidian-data` và volume `webobsidian_webobsidian-data` (đổi checkout chứ không copy data) →
  `settings.json`/`uistate.json`/index giữ nguyên. Runbook + rollback ở `docs/DEPLOYMENT.md`.
  **Đã chạy thật trên 107 (2026-09-20)**: bootstrap `--bootstrap` (backup → clone fork → build → up →
  smoke 5/5), kiểm chứng sau migrate 18/18 PASS (vault 80 file + md5 manifest, `settings.json`,
  `uistate.json` giống hệt trước; `/auth/status` chuyển từ `{passwordSet,mustChangePassword}` của
  upstream sang `{passwordSet}` của fork; login password thật 200; URL public
  `https://webobsidian.digitalciapp.com` phục vụ bản fork), và lần deploy **tự động** đầu tiên chạy
  đúng luồng: merge PR #5 → CI xanh trên `main` → workflow `Deploy (LXC 107)` trên self-hosted runner
  sync đúng commit `278f617`, backup, rebuild, healthy, smoke 5/5, log `deploy OK: 278f617 is live`.
- 2026-09-13: Completed M9.12 (PRD 1.6, FR-2) — reusable preview tabs for browsing notes,
  double-click to keep open, automatic promotion on edit/create, and persisted preview state.
  Latest note selection wins when reads finish out of order. Verified 11 store regression tests,
  `npm run typecheck`, `npm run build`, and browser checks of reuse, double-click, edits, and reload.
- 2026-08-20 (FR-1 — symlink vault roots): vault dùng `readdir` với Dirent (semantics lstat) nên symlink
  không bao giờ được liệt kê (không `isDirectory`/`isFile`), và `assertRealpathInVault` chặn mọi đường
  thoát khỏi vault root đơn — vault có folder symlink trỏ ra ngoài root vô hình. **Sửa:** walks của
  `listTree`/`copy`/`listMarkdownFiles`/`buildFileIndex` xử lý `e.isSymbolicLink()` (theo `fs.stat` →
  folder/file, link hỏng bỏ qua) với cycle guard bằng `realpath` (Set) chống vòng lặp (vd symlink trỏ ngược
  về root thành folder rỗng thay vì đệ quy vô hạn); `assertRealpathInVault` kiểm tra realpath theo **tất
  cả** allowedRoots thay vì root đơn; `fs.cp` bật `dereference: true`. Đã xác minh: vault có 3 symlink
  trỏ ra ngoài → 434 file `.md` được liệt kê/đọc/search OK, typecheck + build sạch.
- 2026-07-27 (security fix: default password `123456` still accepted after an override was configured):
  `checkPassword()` (server/src/services/auth.ts) only skipped the default-password branch when
  `auth.userPasswordHash` was set. Configuring `WEBOBSIDIAN_PASSWORD` or a hand-edited `auth.passwordHash`
  does **not** populate that field (`bootstrap.ts` deliberately only logs), so an operator who followed the
  documented Docker path (`.env.example` calls it the "Initial master password", `docker-compose.yml` says
  "Set an initial password"), set a strong secret and never opened the UI **still had `123456` accepted as a
  full owner session**: the whole vault, `/api/settings`, `/api/keys`, `/api/git` including the stored PAT,
  and the WebSocket stream. `GET /auth/status` made this trivially discoverable: it requires no auth and
  returned `mustChangePassword`, which is exactly `userPasswordHash === ''`, so a port scan identified every
  instance that would accept the default.
  **Fix, in 4 places:** (1) new `server/src/services/password-policy.ts` exporting
  `isDefaultPasswordActive(auth)`, true only when none of `userPasswordHash` / `passwordHash` /
  `config.initialPassword` is set (a separate module so `auth.ts` and `settings.ts` can share one condition
  without an import cycle). (2) `checkPassword()` gates the default branch on it. (3) `hasCustomPassword()`
  and `redactSettings()` derive from the **same** predicate, so the "must change" signal can never disagree
  with "is the default accepted"; that drift was the actual bug, and disagreement would strand the user,
  since ForceChangePassword submits `changePassword('123456', ...)`. (4) `GET /auth/status` now returns only
  `{ passwordSet }`; the client only ever read that field (`Login.tsx`), and `mustChangePassword` remains
  available post-login on `/auth/login` and `/auth/me`.
  *Deliberate side effect:* the desktop shell injects its per-install secret as `WEBOBSIDIAN_PASSWORD`, so
  `123456` is now never valid on the loopback server even if `autoLogin()` fails, which previously left it live.
  Verified against a running server, 3 scenarios / 8 assertions: with an env password set `123456` is
  rejected (401) and the configured password accepted (200); with only a hand-edited recovery hash `123456`
  is rejected and the recovery password accepted; with nothing configured `123456` still works (200) and
  login reports `mustChangePassword: true`, preserving the documented first-run flow. `/auth/status` returns
  `{"passwordSet":true}` with no `mustChangePassword` key. Typecheck + build clean.

- 2026-10-16 (Issue #36 — bắt đầu): xác nhận logic auto reveal hiện có (`autoReveal` + expand ancestor + scroll + active highlight) đã đáp ứng phần hành vi; đang bổ sung setting hiển thị rõ ràng trong Settings → Vault & Files và cập nhật PRD/plan.
- 2026-10-16 (Issue #36 — hoàn tất): thêm checkbox `Reveal active file in explorer` ở Settings → Vault & Files (bind trực tiếp state persisted `autoReveal`), bổ sung setter `setAutoReveal` trong store, đổi tooltip nút crosshair ở header Files theo cùng wording, và cập nhật PRD 1.12 + plan phase 32. Verify: `npm --workspace web run typecheck` + `npm --workspace web run build` pass.
- 2026-10-16 (Issue #34 — Manual sorting file explorer): thêm mode sort `Manual` + metadata `manualOrder` persist trong `/api/uistate` theo từng parent folder; khi reload/reopen/switch folder vẫn giữ thứ tự. Drag-thả trên sibling row trong cùng thư mục sẽ reorder (file+folder cùng danh sách), không đổi tên đường dẫn. Khi tree đổi (create/move/delete), reconcile giữ thứ tự cũ và append item mới vào cuối thư mục đích. Verify: web/server typecheck + build sạch.
- 2026-10-16 (Local attachments #30): ảnh dán lưu cạnh note + link tương đối; endpoint resolve/references/permanent delete;
  icon xoá khi hover ảnh. Server + web typecheck sạch; chưa kiểm thử thủ công trên trình duyệt.
- 2026-10-16 (Quick create #23): hover thư mục trong file tree hiện icon New note / New canvas ở bên phải; tạo
  trong thư mục đó và vào inline rename ngay (newCanvas dùng cùng luồng rename như newNote). Chưa chạy được
  typecheck/build trong môi trường này (thiếu deps).
- 2026-10-16 (Issue #20): hanging indent không ổn định do phép nhân trong CSS `calc()` khi tạo prefix và negative indent. Thay bằng chuỗi phép cộng theo số cấp lồng, cùng phép trừ tương thích hơn với Edge. Verify: typecheck/build sạch; Chromium xác nhận wrapped line thẳng hàng cho bullet, numbered, task và nested list.
- 2026-10-16 (Double-click rename #19): dùng lại inline rename hiện có cho tên file tree, bỏ xử lý click lần hai
  để tránh mở/toggle thêm; giữ nguyên luồng context menu. Web typecheck + production build sạch.
  Sửa: double-click note chưa mở → editor mount `v.focus()` làm blur input rename; bỏ focus khi `renamingPath` set. Verify thủ công: note/canvas/folder rename + Escape.
- 2026-10-14 (External media embeds #6): thêm `resolveExternalEmbed` + rehype plugin chạy sau sanitize,
  widget Live Preview, CSS responsive. Typecheck OK; kiểm chứng render server (HTML iframe thô bị loại).
- 2026-10-13 (release v0.1.2 — cấu hình đã kiểm chứng): root/desktop + lockfile đồng bộ `0.1.2`;
  publish target/homepage/download links trỏ về fork. `npm ci`, typecheck root + desktop, build
  web/server + desktop bundle đều OK sau thay đổi. Nội dung kể từ v0.1.1: fix dark-mode contrast/cursor
  (#19), metadata và tài liệu fork. npm báo 45 vulnerability dependency có sẵn; không đổi dependency.
- 2026-10-13 (release v0.1.2 — bắt đầu): theo quy trình tag/draft của FR-13; giữ author/copyright upstream.
  Baseline: `npm ci`, typecheck root + desktop, build web/server + desktop bundle đều OK.
- 2026-10-12 (Bug #19 — dark mode contrast): chữ tối trên nền tối trong modal/Settings do `body` resolve `--text-normal` theo `:root` (light) nên con kế thừa màu tối; con trỏ CodeMirror mặc định đen. Fix CSS (`obsidian.css`): đặt `color`/`background` trên `.theme-light/.theme-dark`, `.modal`, `.context-menu`, `.toast`; đặt `border-left-color` cho `.cm-cursor`/`.cm-dropCursor` (trắng ở dark). Typecheck OK; chưa kiểm chứng trực quan.
- 2026-06-27 (security fix — leo thang quyền qua token share): `verifyToken()` (server/src/services/auth.ts)
  chỉ kiểm tra chữ ký nên **mọi** token ký bằng `auth.jwtSecret` đều được chấp nhận như phiên owner. Endpoint
  public `POST /public/shares/:id/unlock` ký unlock-cookie bằng cùng secret → người được chia sẻ (có mật khẩu
  share) có thể replay JWT đó làm Bearer token và đọc/ghi toàn vault, `/api/settings`, `/api/keys`, WS stream.
  **Sửa:** (1) `verifyToken()` bắt buộc `sub === 'owner'` và ghim `algorithms: ['HS256']` (chặn cả alg=none).
  (2) `issueToken()` ghim HS256. (3) Defense-in-depth: unlock token nay mang `sub: 'share'`, và `isUnlocked()`
  (shares.ts) xác minh `sub === 'share'` + đúng `share.id`, ghim HS256. Đã xác minh: owner=accept, share=reject,
  alg=none=reject. Typecheck sạch. Báo cáo riêng tư từ enduser theo SECURITY.md (v0.1.0, commit 8c5c283).
  **Kèm 2 hardening mức thấp từ cùng báo cáo:** (a) `rendercanvas.ts` — geometry node (`x/y/width/height`) và
  `textAlign` lấy từ JSON `.canvas` bị nội suy thẳng vào `style="…"` không escape/ép kiểu → `.canvas` độc hại
  (import/tải về rồi share) có thể thoát attribute & chèn HTML. Sửa: ép geometry về số hữu hạn (`num()`) ngay khi
  parse nodes (an toàn cho cả `style`, `bbox`, phép cộng `shifted`), whitelist `textAlign` ∈ {left,center,right}.
  Đã test: payload `<script>`/`onerror` bị vô hiệu. (b) `settings.ts#sanitizeVault` — `allowedRoots` nay lọc chỉ
  string không rỗng và `path.resolve` về tuyệt đối, tránh persist phần tử rác làm crash `path.*`. **Hoãn (item 1):**
  default-password (`123456`) login qua API là thiết kế có chủ đích ("dùng được ngay", auth.ts §10-11) — không sửa
  lặng lẽ; nếu siết cần cập nhật PRD trước. Prod hiện đã đặt pass tùy chỉnh nên không bị phơi nhiễm.
- 2026-06-24 (security fix F-03 — bypass rate-limit login qua `X-Forwarded-For`): trước đây
  `app.set('trust proxy', 1)` luôn bật ⇒ `req.ip` lấy từ `X-Forwarded-For`; instance lộ trực tiếp
  (bind `0.0.0.0`) cho phép attacker tự đặt XFF mỗi request → mỗi "IP" một bucket → vượt giới hạn
  10 lần/15 phút (brute-force pass mặc định 6 ký tự). **Sửa 3 chỗ:** (1) `server/src/config.ts` —
  thêm `trustProxy` parse từ env `TRUST_PROXY`, **mặc định `false`** (không tin XFF khi không có proxy);
  nhận `true`/số hop/danh sách subnet. (2) `server/src/index.ts` — `app.set('trust proxy', config.trustProxy)`
  thay cho giá trị cứng `1`. (3) `server/src/middleware/ratelimit.ts` — limiter khóa theo
  `req.socket.remoteAddress` (địa chỉ TCP peer **không thể giả mạo**) thay cho `req.ip`, nên throttle
  giữ vững bất kể cấu hình `trust proxy`. Cập nhật PRD (FR-9 env `TRUST_PROXY` + NFR bảo mật). Typecheck sạch.
  **Điều chỉnh 2026-06-27 (khi merge PR #1):** vì phần fix rate-limit theo socket TCP ở trên đã tự vá F-03
  bất kể `trust proxy`, nên **giữ mặc định `trust proxy` = bật (`true`)** thay vì đổi sang `false` — tránh
  làm phiền số đông chạy sau reverse proxy (mất cờ `Secure` của cookie + cần cấu hình thêm). `TRUST_PROXY`
  vẫn cấu hình được để hạ xuống `false`/số hop/subnet khi cần.
- 2026-06-23 (fix — internal link tới file `.canvas`): click wikilink trỏ tới `Foo.canvas` bị điều hướng sang
  note markdown mới `Foo.canvas.md`. Nguyên nhân: link graph (`keyToPath`) chỉ index file markdown nên
  `/api/.../resolve` trả `null` cho target có đuôi `.canvas` → client rơi vào nhánh tạo note & nối thêm `.md`.
  Sửa 2 chỗ: (1) `server/src/routes/search.ts` — khi `resolveLink` miss và target có đuôi **không phải md**, fallback
  sang `resolveFile` (file index toàn vault) để mở đúng canvas; bare `[[Foo]]` vẫn giữ hành vi cũ. (2)
  `web/src/lib/store.ts#openWikilink` — chỉ nối `.md` khi target **không có đuôi**, tránh `Foo.canvas.md`. Typecheck sạch.
  **Khi deploy phát hiện thêm 2 lỗi:** (a) note đã chuyển vào `.trash` vẫn bị index trong link graph nên file rác
  `Foo.canvas.md` (do chính bug cũ tạo) **che** canvas thật → `/api/resolve` trả path trong `.trash`. Sửa: bỏ qua
  dotfile/dot-dir trong `listMarkdownFiles()` + `updateLinkGraphForFile()` (đồng bộ với tree view & fileindex). (b)
  `.dockerignore` không loại `obsvault` (~6 GB LFS bind-mount) nên `COPY . .` nuốt cả vault → build prod treo ~30 phút;
  thêm `obsvault`/`*.tsbuildinfo`/`desktop/dist|release` → COPY còn ~1.5s. **Đã deploy & verify trên prod**
  (`xnohat.i234.me:8787`): resolve `Agent SLM Business Model.canvas` → đúng canvas thật, bare wikilink & note thiếu không regression.
- 2026-06-22 (FR-13 — Desktop app Electron đa nền tảng, theo yêu cầu người dùng): bundle WebObsidian thành
  app cài đặt mac/win/linux (arm64/x64/ia32) tải từ GitHub Release. Thêm workspace `desktop/` là **Electron
  shell** spawn đúng server Express hiện có như tiến trình con (`ELECTRON_RUN_AS_NODE`, `127.0.0.1` + cổng
  ngẫu nhiên) rồi load SPA trong `BrowserWindow` — không đổi 1 dòng server/web code. Mấu chốt đóng gói: server
  **không có native module runtime** (chỉ `fsevents` optional/macOS) nên esbuild bundle được thành **1 file
  `.mjs`** và cross-arch chỉ là tải Electron binary tương ứng (không cần rebuild/qemu/wine). UX liền mạch: lần
  đầu chọn vault, dữ liệu vào `userData`, **auto-login** bằng mật khẩu ngẫu nhiên/máy (seed JWT cookie vào
  session, tự đặt custom password để không bắt đổi pass). Đóng gói electron-builder: dmg/zip · nsis/portable ·
  AppImage/deb; CI `release.yml` matrix 3 OS publish GitHub Release (draft) khi push tag `v*`. **Verify thật
  trên macOS arm64**: (1) bundle server chạy độc lập → healthz `{ok:true}`, login override OK; (2) chạy Electron
  (unpacked) với config seed → server boot cổng ngẫu nhiên, `userPasswordHash` set, `mustChangePassword:false`,
  không lỗi; (3) `electron-builder --dir` → `WebObsidian.app`, layout `resources/server/{dist,public}` đúng,
  chạy bản packaged → server boot từ resources, healthz/login OK. Typecheck desktop sạch. *Gotcha:* shell có
  `ELECTRON_RUN_AS_NODE=1` (từ crawbot) khiến `require('electron')`→string lúc test → launch test phải
  `env -u ELECTRON_RUN_AS_NODE` (app packaged không bị); electron hoist root node_modules nên phải pin
  `electronVersion` cho builder. **Chưa làm:** code-sign/notarize, auto-update.
- 2026-06-22 (Fix Graph view dưới CSP không cho `unsafe-eval`): trên host production (vd `360of.me`) Graph
  view trắng + lỗi `Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module`.
  PixiJS v8 sinh code shader/UBO bằng `new Function()`, bị CSP chặn. Sửa: trong `GraphView.tsx` import
  `pixi.js/unsafe-eval` (module tự cài polyfill không-eval) trước `app.init()`; thêm `declare module` cho
  subpath trong `vite-env.d.ts` (Pixi không export `types` cho subpath này). Typecheck + build pass.
- 2026-06-19 (FR-2 — Audio/Video embed phát được như Obsidian, theo yêu cầu người dùng): note `.mp4`
  (Trilium export: frontmatter + `![[clip.mp4]]`) trước đây chỉ hiện link xanh, nay render **trình phát
  HTML5 thật**. Sửa 3 đường render — Live Preview (`MediaWidget` trong `livePreview.ts`, là view đang
  dùng cho cả Reading read-only), Reading/transclusion/canvas (`markdown.ts`), public share SSR
  (`renderhtml.ts`); cả 3 thêm `<video>/<audio>/<source>` vào allowlist `rehype-sanitize` (nếu không
  sanitizer xoá tag). Mở thẳng file media từ tree → player (`Workspace.tsx`, như ảnh). Bộ extension khớp
  Obsidian (video `mp4/webm/ogv/mov/mkv`, audio `mp3/wav/m4a/3gp/flac/ogg/oga/opus`) gom về
  `web/lib/media.ts` + `server/services/mime.ts`; size param `![[clip.mp4|W]]` đặt width video.
  **Mấu chốt:** route serve binary (`GET /api/files/content` + raw share) đổi từ `readFileBuffer`→`res.send`
  (đọc cả file vào RAM, không seek) sang **stream + HTTP Range** (`services/httpfile.ts` →
  `sendFileWithRange`): trả 206 Partial Content nên scrub/seek video & Safari phát được. Verify thật:
  login `access` → `GET …/8257903_hd (2).mp4` (resolve basename từ `Attachments/`, 17MB) trả 206
  (`Content-Range: bytes 0-1023/17758055`, `video/mp4`, `Accept-Ranges: bytes`), full GET 200, range
  vô lệ 416; sanitizer giữ nguyên `<video>/<audio>` (test `renderNoteHtml`). Visual screenshot trong app
  bị chặn (profile Chrome debug đang bị instance khác khoá — không tự ý kill) → xác minh qua bundle có
  `cm-embed-video`/`media-embed` + hợp đồng server/sanitizer.
- 2026-06-19 (Fix 2 bug Files panel — verify bằng Chrome DevTools end-to-end trên vault test):
  **(1) Nút Sort không hoạt động:** menu sort mở bằng **click trái** bị đóng ngay lập tức bởi chính cú click đó.
  `ContextMenu` gắn listener `window 'click'` để đóng khi click ra ngoài; với click trái, sau khi React commit effect,
  cú click vẫn đang bong-bóng tới `window` → listener bắt được → đóng menu. (Menu chuột phải không dính vì sự kiện
  `contextmenu` không phát ra `click`.) Fix: gắn listener đóng ở **tick kế tiếp** (`setTimeout(…, 0)`) trong
  `web/src/components/ContextMenu.tsx`. Verify: click nút Sort → menu hiện đủ 6 mục (đúng như Obsidian app: File name
  A→Z/Z→A, Modified new→old/old→new, Created new→old/old→new) → chọn "File name (Z to A)" → file đảo thứ tự (folder vẫn nhóm trước).
  **(2) Kéo-thả di chuyển file không ăn:** chỉ **hàng folder** mới nhận drop; thả file lên một **file khác** hoặc vào
  **vùng con của folder đang mở** thì sự kiện drop bong-bóng lên root handler → no-op (file gốc) hoặc chuyển nhầm về vault root.
  Fix: hàng file cũng là drop target (`onDragOver/onDragLeave/onDrop` + class `drop-target`), thả lên file = chuyển vào
  **thư mục cha của file đó** (đúng hành vi Obsidian) trong `web/src/components/FileTree.tsx`. Verify: kéo file root thả lên
  file nằm trong folder Alpha (đang mở) → file chuyển hẳn vào Alpha (trước đó đứng yên).
- 2026-06-18 (Phase 30 — Canvas nâng cấp tương tác + Canvas public share + chùm fix UX theo phản hồi liên tục):
  **Canvas (M25.7–25.9):** marquee kéo-chọn nhiều node + đường gióng (alignment snap-guides) port từ
  `getSnapping/O3/P3` của Obsidian asar (snap 4 góc + tâm, dist `ceil(15/scale)`, Alt tắt snap, Shift khoá trục);
  phím tắt format (⌘B/I/K/L/`⌘/`, `toggleWrap`) + căn lề text (`TextNode.textAlign`, nút selection-menu + submenu).
  **Canvas public share (FR-10 mở rộng):** `server/src/services/rendercanvas.ts` render `.canvas` ra HTML tĩnh
  (node tuyệt đối + edges SVG, text/embed qua `renderNoteHtml`, allowlist ảnh qua `canvasEmbedTargets`); `sharepage.ts`
  nhánh canvas (layout `bare`, og:meta), `shares.ts` cho phép `.canvas`; client mở "Share…" cho canvas (Workspace +
  FileTree). Verify CDP end-to-end: tạo share → `/share/:id` HTTP 200 render đủ node/edge/arrow + og:title.
  **Fix UX:** (a) mũi tên edge to hơn; (b) menu chuột phải card mở tại con trỏ + clamp trong màn hình (fixed + đo);
  (c) **thu panel trái không còn chừa khoảng trống phải** — `.app` grid đổi sang cột theo biến `--sidebar-width/--right-width`
  + pin `grid-column` từng cột (col editor luôn `1fr`); (d) **kéo resize sidebar trái** (`.sidebar-resizer`, clamp 180–560px,
  lưu `localStorage`); (e) bỏ nút **Refresh** thừa ở header Files (đã có Sync dưới); (f) **fix 2 thư mục Attachments/attachments**
  — upload resolve thư mục **case-insensitive** (`vault.resolveDirCaseInsensitive`) nên dùng lại folder sẵn có thay vì tạo trùng.
  Typecheck + build (server + web) sạch.
- 2026-06-15 (Phase 29 — Sort by modified/created time, nhanh nhờ stat cache): thêm 4 lựa chọn sort theo
  thời gian (Modified/Created · new→old / old→new) vào dropdown header Files. **Nhanh**: server giữ
  `statCache` (Map path→{mtime,ctime}) trong RAM — `listTree()` fill 1 lần (stat song song theo từng thư mục),
  steady-state đọc cache → 0 syscall; watcher gọi `invalidateStat(rel)` khi file add/change/unlink nên chỉ
  re-stat đúng file đổi. Tránh hẳn vấn đề 27k stat/lần-fetch mà comment cũ cảnh báo. `TreeNode` thêm `ctime`
  (server lấy `birthtimeMs || mtimeMs`). Sort client-side đệ quy per-folder (folder luôn nhóm trước, sort theo
  tên; file theo tiêu chí chọn) — đúng như Obsidian chỉ sort các item **đang hiện diện** trong panel (collapsed
  không render). `treeSort` mở rộng 6 giá trị, persist. Typecheck + build sạch.
- 2026-06-14 (Phase 28 — File tree header toolbar parity Obsidian theo yêu cầu người dùng): dựng lại header
  sidebar Files đủ nút như Obsidian: **New note** (icon `square-pen`), **New canvas** (`layout-dashboard`),
  **New folder** (`folder-plus`), **Change sort order** (dropdown: File name A→Z / Z→A, có ✓ ở mục đang
  chọn — `treeSort` persisted, sort đệ quy client-side, folder luôn trước), **Auto reveal current file**
  (toggle `autoReveal` persisted — tự expand ancestors + scroll tới file active khi đổi file), **Collapse all /
  Expand all** (1 nút đổi trạng thái theo `expanded.length`; expand-all gom mọi folder path qua
  `collectFolderPaths`), + giữ Refresh/Trash. Store: `setExpanded`, `treeSort/setTreeSort`,
  `autoReveal/toggleAutoReveal` (thêm vào PERSIST_KEYS + applyPersisted). CSS: `.nav-header` cho `flex-wrap`
  (8 nút không tràn trên mobile), `.nav-action.active` màu accent. LƯU Ý: sort theo modified/created time chưa
  làm vì server cố tình không stat mtime từng file (~27k file → 27k syscall mỗi lần fetch tree). Typecheck +
  build sạch; bundle chứa đủ chuỗi nút.
- 2026-06-14 (Phase 27 — Canvas mobile edit-save + nút New canvas theo phản hồi người dùng): (1) **fix
  Android Chrome không lưu được text khi double-tap edit node**: nguyên nhân là blur của `<textarea>`
  thường KHÔNG kích hoạt khi bàn phím mềm Android đóng → edit mất. Thêm `commitTextEdit()` (idempotent,
  guard qua `editingNodeRef`) gom mọi đường lưu, và **listener `pointerdown` capture-phase trên document**
  (chạy khi đang edit): chạm/click ra ngoài textarea (trừ `.canvas-textmenu/.canvas-linkpicker/.canvas-notepicker`)
  → commit. onBlur/linkPicker-dismiss nay cũng route qua `commitTextEdit`. (2) **double-tap touch tự nhận
  diện** trong `beginNodeDrag` (2 tap <350ms cùng node) → `activateNode` (text→edit, file→open, link→open)
  vì Android không sinh `dblclick` đáng tin. (3) **nút "New canvas"** (icon `layout-dashboard`) trên header
  sidebar Files cạnh New note/New folder — trước chỉ tạo được canvas qua right-click (không khả dụng trên
  mobile). Typecheck + build sạch; bundle chứa selector tap-outside + ngưỡng 350ms.
- 2026-06-14 (Phase 26 — Ảnh: resize + zoom lightbox theo yêu cầu người dùng): (1) **kéo để resize** ảnh
  nhúng — 2 thanh handle trái/phải hiện khi hover trong Live Preview, kéo đổi rộng (clamp 40..bề rộng content,
  giữ tỉ lệ height auto) và **ghi lại vào source** dạng size param Obsidian qua `writeImageWidth()`:
  `![[img|W]]` cho wikilink embed, `![alt|W](url)` cho ảnh markdown (recover vị trí widget qua `posAtDOM` rồi
  re-match token phủ vị trí). (2) **Size param cho ảnh markdown** `![](…)`: alt mang `|W`/`|WxH` nay áp dụng
  width/height ở cả Live (imgRe) lẫn Reading (markdown.ts) — trước chỉ `![[…]]`. (3) **Lightbox zoom**
  (`lib/imageLightbox.ts`): click ảnh ở cả 2 mode → overlay toàn màn hình; wheel zoom theo con trỏ, pinch
  2-ngón theo tâm, kéo/1-ngón pan, double-click reset, Esc/click nền/× đóng. Typecheck sạch. Build + deploy prod.
- 2026-06-13 (Phase 25s — Canvas drag handle + fix node lẹm trái trên mobile): (1) **drag handle** (grip
  chấm) nổi trên đỉnh mỗi node — tap/giữ-kéo để di chuyển node (tiện cho touch); hiện khi hover/selected và
  **luôn hiện trên mobile**; `onPointerDown→beginNodeDrag`, `touch-action:none`. (2) **fix node bị lẹm một
  miếng bên trái ở vài mức zoom trên mobile Safari**: `.canvas-world` đang `width:0;height:0` → Safari clip
  descendant scaled nằm trái/trên gốc → đổi thành `width:100%;height:100%;overflow:visible`. Smoke-test
  (viewport 390px): node render đủ viền trái; grip kéo node bằng touch +200/+150 và mouse −150/−100; pan nền
  vẫn +120; không lỗi console. Typecheck + build sạch. Deploy prod.
- 2026-06-12 (Phase 25r — Canvas mobile: pinch-zoom + toolbar không overlap): trên điện thoại canvas không
  pinch-zoom được (`touch-action:none` chặn gesture trình duyệt) và 2 toolbar dưới đè nhau. Fix: (1)
  **pinch-to-zoom + 2-ngón pan** qua listener pointer **capture-phase** trên viewport (ngón thứ 2 hủy drag
  1-ngón rồi pinch, chạy cả khi đặt trên node); 1-ngón pan vẫn dùng pointer drag cũ. (2) `@media
  (max-width:768px)`: tách **zoom toolbar (trái-dưới)** và **add toolbar (phải-dưới)**, target chạm to hơn.
  Smoke-test (viewport 390px, synthetic touch): pinch scale 1.5→4 và 4→0.8; 1-ngón pan Δx đúng; toolbar tách
  2 góc; không lỗi console. Typecheck + build sạch. Deploy prod.
- 2026-06-12 (M3.6 — Trash UI + deleteMode, theo yêu cầu người dùng): thêm setting `vault.deleteMode`
  (`trash` mặc định | `permanent`) — DELETE `/api/files/` rẽ nhánh trash vs `vault.remove()` xoá hẳn.
  Service vault: `listTrash/restoreFromTrash/deleteFromTrash/emptyTrash` (+ `pruneEmptyDirs`, guard
  `assertInTrash` chống thao tác ngoài `.trash`). Routes `/api/files/trash` (GET list · POST restore ·
  DELETE item · DELETE empty). Frontend: `api.listTrash/restoreTrash/deleteTrashItem/emptyTrash`, store
  `trashOpen/setTrash`, modal `TrashView` (Restore / xoá vĩnh viễn / Empty trash) mở từ nút 🗑 header Files,
  command palette "Open trash". Settings → Vault & Files thêm select chế độ xoá. Confirm/notify file tree +
  pane menu đổi sang generic "Delete" + báo "Moved to trash" / "Deleted permanently" theo response. Verified
  end-to-end qua curl trên vault tạm: trash list giữ cấu trúc thư mục, restore né trùng tên + prune dir rỗng,
  permanent mode xoá hẳn (không lưu bản sao), empty trash, guard "Not a trash item", PUT deleteMode giữ
  nguyên `vault.path`. Typecheck 2 workspace sạch.
- 2026-06-12 (Phase 25q — Canvas external link new-tab + open zoom-to-fit theo phản hồi): (1) **external
  link** (`http(s)://`) trong card → `onClickCapture` trên node `window.open(href,'_blank')` mở tab trình
  duyệt mới (wikilink href="#" vẫn rớt xuống openWikilink). (2) **Mở canvas tự Zoom-to-fit**: bỏ reset view
  cứng {60,60,1}; effect `fittedFor` gọi `zoomFit()` 1 lần/canvas (rAF sau khi data parse + viewport có kích
  thước). Smoke-test: canvas 2 node cách xa mở ở 53% fit cả 2; click external link → window.open _blank;
  không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25p — fix click wikilink trong canvas card): click vào `[[link]]` trong text card không
  navigate được — do click thật bị jitter >1px → lazy `setPointerCapture` (node move) retarget click khỏi
  link. Fix: trong `beginNodeDrag`, nếu pointerdown rơi vào `[data-wikilink]`/`a` thì **return sớm** (không
  bắt đầu drag/capture, không stopPropagation) → để click đi tới Preview.onClick → `openWikilink`; viewport
  vẫn không pan (target nằm trong .canvas-node). Smoke-test: real CDP click link "NoteA" trong card →
  điều hướng `/note/NoteA.md`; không lỗi console. Build sạch.
- 2026-06-12 (Phase 25o — Canvas "Add link" dropdown search note như Obsidian): "Add link" giờ mở
  **dropdown search note** (tái dùng style notepicker) tại caret thay vì chỉ bọc `[[]]`. Lưu caret
  (`linkInsertPos`), guard `onBlur` khi dropdown mở (giữ card editing), chọn note → chèn `[[basename]]` tại
  caret rồi refocus; Esc/click nền → đóng + commit. Search lọc theo path; Enter chọn mục đầu; item
  `onMouseDown preventDefault`. Smoke-test: Add link → dropdown liệt kê note (K.canvas/NoteA/Task); gõ "task"
  → lọc còn Task; chọn → chèn `[[Task]]`; không lỗi console. Build sạch.
- 2026-06-12 (Phase 25n — Canvas text menu: Add link/external lên top-level): theo Obsidian, **Add link**
  (`[[…]]`) và **Add external link** (`[…](https://)`) là mục cấp 1 đầu menu (không nằm trong Insert) — đã
  chuyển ra top-level + bỏ khỏi submenu Insert. Smoke-test: menu top-level = Add link/Add external link/—/
  Format/Paragraph/Insert/—/Cut/Copy/Paste/Select all; Add link → `[[word]]`; không lỗi console. Build sạch.
- 2026-06-12 (Phase 25m — Canvas resize dễ hơn theo phản hồi): trước handle giữa-cạnh bị **port nối đè**
  (z) nên chỉ kéo được 4 góc nhỏ. Giống Obsidian: **4 handle góc rõ** (12px, nền trắng + viền accent, z8
  trên port) cho resize chéo + **dải kéo viền cạnh** (`.canvas-edge-resize` n/s/e/w, inset 12px khỏi góc,
  z6 dưới port nên chấm nối giữa cạnh vẫn để nối). Fix resize không lưu (commit dùng `dataRef` trễ 1 frame)
  → tách `resizeRect()` tính từ toạ độ event, commit ở pointerup từ event (robust). Smoke-test: chọn node →
  4 góc + 4 dải cạnh; kéo góc SE +120/+80 → 240×140 → 360×220, autosave đúng; không lỗi console. Typecheck +
  build sạch.
- 2026-06-12 (Phase 25l — Canvas text-card menu phân cấp clone Obsidian bundle): reverse-engineer
  `obsidian.asar` i18n lấy đúng cấu trúc editor menu → build menu **phân cấp** (`TextFormatMenu`,
  submenu mở sang phải khi hover) khớp y Obsidian: **Format›** (Bold/Italic/Strikethrough/Highlight/Code/
  Math/Comment/—/Clear formatting), **Paragraph›** (Bullet/Numbered/Task list/—/Heading 1-6/Body/—/Quote),
  **Insert›** (Add link/Add external link/—/Table/Callout/Code block/Math block/Horizontal rule/Footnote),
  —, Cut/Copy/Paste/Select all. Helpers: `setLinePrefix` (thay prefix heading/list/quote đầu dòng),
  `insertAtCaret`, `clearFormatting`, clipboard execCommand. Vẫn giữ focus textarea (mousedown
  preventDefault). Smoke-test: right-click card "hello world" → menu 3 submenu + clipboard; Paragraph›Heading
  2 → `## hello world`, blur render `<h2>`, không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25k — Canvas text-card format menu theo phản hồi): right-click **bên trong text card
  đang edit** → menu định dạng markdown như Obsidian: Bold/Italic/Strikethrough/Highlight/Code (bọc selection
  `**`/`*`/`~~`/`==`/`` ` ``), Heading/Bullet list/Quote/Checkbox (prefix đầu dòng), Link/Wikilink. Menu
  `onMouseDown=preventDefault` để textarea **không blur** (giữ focus + selection); `applyFormat` chỉnh
  `textarea.value` trực tiếp (uncontrolled, blur commit). Đóng menu khi click nền / blur. Smoke-test: edit
  card "hello world", chọn all, right-click → menu đủ 11 mục; Bold → `**hello world**`, blur render
  `<strong>`, autosave đúng; không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25j — Canvas colored-node styling + node right-click menu theo phản hồi): (1) node có
  màu giờ hiển thị **viền màu đều 3px quanh node + nền tint nhạt** (`color-mix --c 10%`) thay vì vạch trái —
  scope `:not(.canvas-group)` để không đè group. (2) **right-click node → context menu nhiều chức năng**
  (dùng store `openContextMenu`): Edit/Open/Open link (theo loại node), **Set color** (submenu Default+6 màu),
  **Duplicate** (copy node + edge nội bộ, lệch 40px, id mới), Zoom to selection, **Bring to front/Send to
  back** (đổi z-order = thứ tự mảng), **Align** (left/center-h/right/top/center-v/bottom — khi chọn nhiều),
  Remove. Thêm `selRef` (selection luôn mới) để callback menu/handler thao tác đúng selection (fix stale khi
  right-click node chưa chọn). Smoke-test: node màu có viền 3px + nền tint; menu hiện đủ mục; Duplicate 2→3
  node, autosave đúng; không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25i — Canvas color picker chuẩn + custom theo Obsidian): palette màu giờ gồm **default
  (xám) + 6 màu preset + nút custom (vòng cầu vồng)** bọc `<input type=color>` để chọn màu tuỳ ý (lưu hex
  vào `color` — JSON Canvas hỗ trợ, Obsidian đọc được). Swatch đang chọn có **ring accent** (so khớp màu của
  node/edge đang chọn; hex → ring ở nút custom). Smoke-test: mở palette thấy 8 swatch + input color, ring ở
  "Color 2" (node màu 2); set custom `#1e90ff` → ghi đúng `color:"#1e90ff"`, card đổi màu xanh; không lỗi
  console. Typecheck + build sạch.
- 2026-06-12 (Phase 25h — Canvas fixes theo phản hồi): (1) nền canvas trắng (`--background-primary` thay
  `--background-secondary`). (2) label connector **bỏ border** (chỉ chữ trên line, vẫn nền mờ để dễ đọc).
  (3) **bug double-click card tạo card mới** thay vì edit: nguyên nhân `beginNodeDrag` gọi `setPointerCapture`
  ngay ở pointerdown → click/dblclick bị retarget về `.canvas-view` nên node `onDoubleClick` (edit) không
  chạy, handler nền tạo card mới. Fix: **capture lazy** — chỉ `setPointerCapture` ở lần move thật đầu tiên
  (mode 'move'), không capture ở pointerdown. Giữ nguyên double-click nền tạo node tại điểm click (như
  Obsidian app). Smoke-test: double-click card → edit, nodeCount giữ 1; double-click nền → tạo card mới +
  edit; label border=none; nền trắng; không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25g — Canvas connect-to-anchor parity, reverse-engineer Obsidian): user phản ánh kéo
  từ anchor sang node khác "chỉ hiện đường gạch đứt". Test xác nhận edge VẪN tạo được, nhưng thiếu UX: node
  đích không hiện anchor + line không snap. Reverse-engineer `app.css`: Obsidian có trạng thái canvas
  **`is-connecting`** → mọi node hiện `canvas-node-connection-point`, anchor đích sáng lên. Clone: thêm state
  `connecting` (bật khi begin connect/reconnect) → **mọi node hiện 4 anchor** khi đang kéo; move tính
  `nearestSide` của node đích → preview line **snap vào anchor** đó + anchor đó nhận class `.active` (sáng +
  glow); drop nối đúng anchor gần con trỏ (connect & reconnect đều dùng `nearestSide(over, cursor)`). Bỏ
  `reconnectEdge` cũ (inline). Smoke-test: giữa lúc kéo có 8 anchor (2 node), B.left `.active`, preview snap;
  thả → edge `a:right→b:left` đúng anchor; không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25f — Canvas bidirectional arrow + kéo endpoint reconnect theo phản hồi): (1) **mũi
  tên 2 đầu không hiện**: marker `orient="auto"` làm arrowhead đầu `from` quay sai chiều + nằm khuất dưới
  node → đổi `orient="auto-start-reverse"` (chuẩn SVG cho line 2 đầu) → bidirectional hiện mũi tên cả 2 đầu.
  (2) **kéo đầu mũi tên ra được** như Obsidian: edge đang chọn hiện 2 chấm endpoint (circle, vector-effect
  non-scaling-stroke); kéo endpoint → thả lên node khác = **reconnect** (đổi from/to-Node + nearest side);
  thả ra vùng trống = menu **Add card / Add note from vault** tạo node mới tại điểm thả và nối luôn (card vào
  edit ngay; note mở picker qua `pendingConnect`). Preview đường kéo realtime. Refactor pointerup connect/
  reconnect tính target từ toạ độ event (bỏ phụ thuộc state `connectTo` bị trễ 1 frame → robust). Menu drop
  clamp trong viewport. Smoke-test: zoom-fit thấy mũi tên 2 đầu; kéo endpoint→Other reconnect (toNode=c);
  kéo ra trống→menu→Add card tạo node nối (4 nodes, edge.toNode=node mới), autosave đúng; không lỗi console.
  Typecheck + build sạch.
- 2026-06-12 (Phase 25e — Canvas arrow-direction dropdown khớp Obsidian): nút hướng mũi tên trước bấm
  cycle → đổi thành **dropdown 3 lựa chọn** y như Obsidian: **Nondirectional** (— không mũi tên),
  **Unidirectional** (→ mũi tên đầu `to`), **Bidirectional** (⇄ 2 đầu), có dấu ✓ ở mục hiện tại; icon nút
  toolbar đổi theo trạng thái. Thêm icon `minus`. CSS `.canvas-dir-menu/.canvas-dir-item`. Smoke-test: chọn
  edge → mở dropdown thấy 3 mục + ✓ Unidirectional; chọn Bidirectional → 2 marker arrow, dropdown đóng,
  autosave `fromEnd/toEnd=arrow`; không lỗi console. Typecheck + build sạch.
- 2026-06-12 (Phase 25d — Canvas edge label/menu fix theo phản hồi): (1) **label nằm đúng giữa line**:
  trước dùng Bézier t=0.5 (lệch) → đổi sang **điểm giữa theo arc-length** (`bezierArcMidpoint`, sample 24
  đoạn, đi nửa độ dài cung); foreignObject 200×32 + wrapper flex center → chip nằm chính giữa trên đường
  cong (verify distToLine=0). (2) thêm nút **Remove label (X)** trong edge menu khi edge có label (khớp
  Obsidian: trash·palette·zoom·⇄·X·pencil). (3) nút hướng mũi tên đổi icon **⇄ (arrow-left-right)**; toggle
  cho ra cả 2 đầu mũi tên (verify marker-start+end). Click label = chọn edge, double-click = sửa. Smoke-test:
  label center=0px lệch, direction→bidirectional, remove label ẩn nút + xoá label, autosave đúng, không lỗi
  console. Typecheck + build sạch.
- 2026-06-12 (Phase 25c — Canvas parity sâu, reverse-engineer Obsidian app theo yêu cầu): extract
  `obsidian.asar` (`app.css`/`i18n.js`) lấy đúng vocabulary menu Canvas (`actionRemove`/`actionSetColor`/
  `actionZoomToSelection`/`actionEditLabel`/arrow ends `none|arrow`) + xác nhận 6 màu preset = red/orange/
  yellow/green/cyan/purple (đã khớp). **(1) Selection menu kiểu Obsidian** nổi trên selection, hoạt động cho
  cả node lẫn **edge** (trước edge không có nút xoá → "ko xoá dc connector"): Remove, Set color (palette mở
  hàng swatch), Zoom to selection; riêng edge thêm **Arrow direction** (cycle toEnd→both→fromEnd→none) và
  **Edit label**. Vị trí menu tính từ bbox selection gồm cả endpoint của edge. **(2) Undo/redo**: stack
  serialized (≤200), `commit` đẩy history + clear redo; `undo`/`redo` + phím **⌘Z/⌘⇧Z/⌘Y**, nút ↶↷ trong
  thanh zoom (disabled khi rỗng), clear khi đổi file. Thêm icon `palette`+`zoom-in` (Lucide) vào Icon.tsx.
  Smoke-test: chọn edge → menu hiện đủ nút; Remove xoá edge, Undo phục hồi, Redo xoá lại; không lỗi console.
  Typecheck + build web sạch.
- 2026-06-12 (Phase 25b — Canvas UX theo phản hồi người dùng): (1) thanh **add** giữa-dưới giống Obsidian
  với 3 nút **Add card / Add card from note / Add image** (tách khỏi cụm zoom góc trái-dưới). "Add card from
  note" mở popup search liệt kê file vault (note + ảnh) → chèn file node tại tâm view; "Add image" mở file
  dialog → `api.upload` → chèn image node. (2) **Kéo nền để pan viewport** (trước phải giữ Space): kéo nền
  trống = pan, **Shift+kéo** = marquee chọn nhiều, click nền (không kéo) = bỏ chọn; con trỏ `grab`/`grabbing`.
  `setPointerCapture` bọc try/catch (robust với synthetic/inactive pointer). Smoke-test trình duyệt: pan đổi
  transform đúng delta, Add note chèn embed, Add image render image node, autosave ghi đủ text+2 file node,
  không lỗi console. Typecheck + build web sạch.
- 2026-06-12 (Phase 25 — Canvas FR-12, clone Obsidian Canvas): thêm `web/src/lib/canvas.ts` (đọc/ghi
  định dạng mở **JSON Canvas** `.canvas`, tab-indent y như Obsidian, parse an toàn về `{nodes:[],edges:[]}`,
  preset 6 màu, hình học edge Bézier theo side + auto-side + nearest-side, bbox/fit) và
  `web/src/components/CanvasView.tsx` (~620 dòng): khung vô hạn pan/zoom (wheel zoom tâm con trỏ, kéo nền/
  space+drag pan), lưới chấm nền co theo zoom; nodes DOM tuyệt đối trong layer transform, edges vẽ SVG (lớp
  dưới) đường cong + mũi tên `marker`; node **text** (Preview markdown / textarea edit), **file** (note=Preview
  embed, ảnh=`<img>`), **link** (card), **group** (nền mờ sau cùng); tạo card double-click nền / nút +, drag
  move nhóm, 8 resize handle, 4 chấm cạnh kéo tạo edge, double-click edge sửa label, marquee + Shift multi-
  select, toolbar màu/xóa nổi, Delete/Backspace xóa. Autosave debounce 900ms qua store `content`/`save`
  (`.canvas` đã trong `TEXT_RE`), không thêm API. Wire `Workspace` render CanvasView cho `.canvas`; store
  `newCanvas`; "New canvas" vào context menu FileTree (file/folder/vault root) + command palette. CSS
  `.canvas-*` trong obsidian.css. Typecheck + build web sạch; smoke-test trình duyệt (vault tạm): render
  group/edge mũi tên/label/embed note đúng, zoom-to-fit, tạo card + đổi màu, autosave ghi đúng JSON Canvas
  round-trip (giữ nguyên node/edge cũ), không lỗi console. PRD lên 1.0 + FR-12.
- 2026-06-12 (Security hardening — audit toàn repo): không có secret lộ trong git (history + tracked
  files sạch; `data/`/`.env`/`.claude/skills/` gitignored). Sửa 9 điểm: **(1)** bắt đổi pass khi còn
  dùng mặc định `123456` — `/auth/login`+`/me`+`/status` trả `mustChangePassword`, web chặn bằng
  `ForceChangePassword` (vẫn bind 0.0.0.0). **(2)** redact git PAT (`https://<token>@…`) khỏi mọi
  error trả client + log (`lib/redact.ts`, dùng trong `errorHandler`, `git.ts` sync/autosync).
  **(3)** `helmet` + CSP (script-src 'self'+nonce; KHÔNG `upgrade-insecure-requests` để giữ HTTP
  self-host; nonce cho inline script trang `/share`). **(4)** rate-limit `/auth/login` 10 lần/15
  phút/IP (`middleware/ratelimit.ts`). **(5/6)** validate plugin `id` (`^[a-zA-Z0-9._-]+$`) ở install
  (manifest.id remote) + serve asset → chặn path traversal đọc/ghi. **(7)** `/ws` yêu cầu cookie
  auth ở bước upgrade. **(8)** `resolveInVault` chặn segment `.git` (RCE qua hooks) + realpath guard
  chống symlink thoát vault. **(9)** đổi `vault.path` qua API phải nằm trong allowedRoots + là thư mục
  tồn tại. Typecheck + build sạch; smoke-test xác minh tất cả. PRD §Bảo mật cập nhật.
- 2026-06-12 (Phase 24 — Copy/Cut/Paste file & folder trong context menu file tree): store thêm
  `clipboard {path, mode}` + `setClipboard` (session-local). FileTree: `doClipboard('copy'|'cut')`
  set clipboard + toast; `doPaste` dán vào folder đích — Cut = `api.rename` (move, hỗ trợ folder,
  chặn dán vào chính nó/thư mục con, dán chỗ cũ = no-op), Copy = `api.copy` đệ quy với `uniqueChildName`
  né trùng tên. Menu file: Copy/Cut/Paste; menu folder: Copy/Cut/Paste. Row bị Cut mờ đi, Paste chỉ
  hiện khi có clipboard. Server: `vault.copy` (`fs.cp` recursive trả list file tạo ra) + route
  `POST /api/files/copy` (reindex `.md` mới, auto-commit); client `api.copy`. PRD 0.9 (FR-1 + API row).
  Bổ sung (M24.4): right-click vùng trống file tree ra menu app (New note/New folder/Paste vào vault root)
  thay vì menu native trình duyệt. Typecheck server + web sạch.
- 2026-06-12 (New folder không prompt + inline rename trong cây thư mục): action store
  `newFolder(dir?)` tạo thẳng folder "Untitled" (tự tăng "Untitled 1/2…" nếu trùng), expand
  ancestor + mở panel Files rồi đặt `renamingPath` = path mới. FileTree thêm component
  `RenameInput` (ô input bo viền accent thay cho `.name`): autofocus + chọn sẵn phần tên (giữ
  đuôi file), Enter/blur → `api.rename`, Escape → huỷ; stopPropagation để click/pointerdown
  không toggle/mở row. Store thêm state `renamingPath` + `setRenamingPath`. Menu "New folder"
  (FileTree) và nút New folder (Sidebar) gọi `newFolder()`, bỏ `prompt('Folder name')`. Tiện thể
  chuyển "Rename…" của file/folder sang inline rename (bỏ prompt path); giữ "Move to…" cho việc
  đổi thư mục. CSS `.tree-rename`. Typecheck + build web sạch.
- 2026-06-12 (New note không prompt + tab-bar controls không bị scrollbar che): (1) thêm action
  store `newNote(dir?)` tạo thẳng note "Untitled.md" (tự tăng "Untitled 1/2…" nếu trùng trong
  folder đích), body rỗng → inline-title hiện tên file như Obsidian, không còn `prompt('Note name')`.
  Thay mọi điểm gọi: ⌘N (App.tsx), Command palette, tab-bar "+", Sidebar Files header, context menu
  FileTree (New note trong folder → `newNote(node.path)`), FolderView header. Giữ prompt cho New
  folder và auto-create theo tên khi click wikilink chưa tồn tại. (2) Tab-bar: bọc danh sách tab
  vào `.tab-scroll` (overflow-x:auto, ẩn scrollbar `scrollbar-width:none`), các nút điều khiển
  (toggle trái/phải, "+" new note) gắn class `tab-ctl` flex-shrink:0 nằm ngoài vùng cuộn → không
  bị scrollbar nuốt chiều cao hay cuộn mất khi nhiều tab. Typecheck web sạch.
- 2026-06-12 (Phase 23 — Render HTML block): note import từ Trilium chứa full trang HTML (SingleFile)
  trong ` ```html ` fence. Yêu cầu nút render block. Lần đầu sửa nhầm `Preview.tsx` (component này
  giờ CHỈ dùng cho trang share — Reading mode thật là CodeMirror editor readonly, M18.14). Fix đúng:
  thêm `htmlPreviewField` (StateField widget) vào `livePreview.ts` + đăng ký ở `Editor.tsx`. Đặt nút
  trên đầu block (side:-1) vì CodeMirror ảo hoá DOM — nút sau block khổng lồ sẽ ngoài viewport. iframe
  sandbox `allow-scripts` không same-origin (cô lập). Giữ luôn nút ở `Preview.tsx` cho `/share`. Verify
  end-to-end bằng chrome-devtools (login pw 123456): nút hiện, click → iframe render đúng trang. Build sạch.
- 2026-06-12 (Folder deep-link → Folder view): mở URL trỏ folder (`/note/<folder>`) trước đây bị
  render như note rỗng (Editor) tên folder. Thêm `lib/tree.ts` (`findNode`/`isFolderPath`) + component
  `FolderView.tsx` liệt kê nội dung folder (folder con + note, sort folder trước; thumbnail ảnh; kéo-thả
  được; nút + tạo note trong folder). `store.openFile` phát hiện folder qua tree → bỏ qua `api.read` và
  không thêm vào Recent. Workspace render FolderView khi `isFolderPath(tree, activePath)`, ẩn nút ⋯
  (menu file không áp dụng cho folder). Typecheck + build sạch.
- 2026-06-12 (Phase 22 — Move file to… + context menu Bookmarks/Recent): tính năng "Move file to…"
  trước đây là `prompt()` gõ tay đường dẫn — thay bằng modal folder-picker kiểu Obsidian
  (`FolderPicker.tsx`, mount ở App cạnh ContextMenu): gõ lọc folder, ↑↓ chọn, ↵ move, ⇧↵ tạo folder
  mới theo tên gõ rồi move (vault.rename tự tạo thư mục cha), esc đóng. State qua `store.movePath`/
  `setMovePath` (không persist). Menu ⋯ (Workspace) và menu chuột phải file tree (FileTree) giờ chỉ
  gọi `setMovePath(path)`. Panel Bookmarks/Recent (`BookmarksPanel.tsx`) thêm `onContextMenu` →
  `openContextMenu` (trước đây right-click rơi vào menu native trình duyệt): Open/Open to right/
  Reveal/Move file to…/Bookmark/Copy path; Recent có thêm "Remove from recent" (`store.removeRecent`).
  Bổ sung: hàng Bookmark/Recent `draggable` (kéo vào folder file tree để move, dùng chung payload
  `text/wo-path`) + nút hover trên mỗi hàng (📁 Move / ✕ Remove). Typecheck + build web sạch.
- 2026-06-12 (Copy path → Copy URL path): menu chuột phải file (FileTree), menu ⋯ (Workspace) và
  panel Bookmarks/Recent đổi "Copy path" → "Copy URL path", copy deep-link đầy đủ
  `${location.origin}${pathToUrl(path)}` (vd `http://localhost:8787/note/...`) thay vì path vault.
  Menu chuột phải folder vẫn giữ "Copy path" (folder không có URL note). Typecheck + build sạch.
- 2026-06-12 (Toast cho "Rebuild search index"): lệnh reindex (~12s với vault 6000+ note) trước
  đây chạy im, không phản hồi UI. `notify()` (store.ts) thêm tham số `ms` (mặc định 2500, `0` =
  giữ tới khi bị thay). CommandPalette: hiện "Rebuilding search index…" (persistent) lúc bắt đầu,
  đổi thành "Search index rebuilt" khi xong (hoặc "Failed to rebuild…" nếu lỗi). Typecheck + build
  web sạch; output vào server/public nên chỉ cần reload, không restart server.
- 2026-06-11 (Fix "Path outside allowed roots" khi Browse vault): folder browser
  (`/api/settings/browse`) chỉ cho đi trong `vault.allowedRoots`, nhưng mặc định roots suy ra từ
  `sample-vault` nên vault ngoài đó (vd `~/ObsidianVault-Trilium`) bị 403. Sửa gốc: thêm
  `ensureVaultBrowsable()` (services/settings.ts) tự thêm thư mục cha của vault vào `allowedRoots`
  khi chưa được phủ — gọi lúc lưu vault path (routes/settings.ts) và backfill khi `loadSettings`
  để chữa file cũ. Đã rebuild + restart server, settings tự heal (`allowedRoots` thêm `/Users/xnohat`).
- 2026-06-11 (Fix search trả 0 kết quả): server/data/qmd-index.json bị persist rỗng
  (`documentCount: 0`, có thể do build chạy lúc vault tạm không đọc được). `QmdEngine.restore()`
  load index rỗng đó rồi set `ready=true` → mọi truy vấn trả 0 và không bao giờ rebuild. Sửa: `restore()`
  coi index 0-doc là cache miss (`return false`) để `initSearch()` build lại từ vault. Đã reindex live
  (6048 docs). Typecheck server sạch.
- 2026-06-11 (M2.5 — Đổi mật khẩu + pass mặc định + override): mô hình auth mới. Pass đăng nhập
  mặc định `123456` (không cần bước setup); pass đã đổi lưu ở `auth.userPasswordHash` (rỗng = mặc
  định). `auth.passwordHash` (settings.json, sửa tay) và env `WEBOBSIDIAN_PASSWORD` giờ là pass
  override khôi phục, login luôn chấp nhận. Server: `checkPassword` kiểm tra pass hiệu dụng + 2 nguồn
  override (`auth.ts`); endpoint `POST /auth/change-password` (requireAuth, verify pass cũ); bootstrap
  không seed pass nữa; `redactSettings` trả `hasCustomPassword`/`hasOverridePassword`. Migration trong
  `loadSettings`: file cũ có `passwordHash` → chuyển sang `userPasswordHash` (tránh backdoor 123456),
  persist lại. Web: `api.changePassword`, tab Settings→Account form đổi pass + cảnh báo đang dùng pass
  mặc định. Typecheck 2 workspace sạch. PRD FR-3 + data model cập nhật.
- 2026-06-11 (M19.7 — Mobile parity vòng 2): vá 3 lỗi mobile người dùng báo. (1) Menu "…" của note bị
  cắt dưới màn hình: `ContextMenu.tsx` clamp `x/y ≥ 8px` + ước lượng chiều cao chặn theo viewport (không
  còn đẩy top âm), CSS mobile thêm `max-height: 100dvh; overflow-y:auto` cho `.context-menu` (submenu
  hover desktop không ảnh hưởng vì media query) + rows 9px dễ chạm. (2) Nội dung note kéo ngang được
  (pan/lệch layout): khoá `overflow-x:hidden` + `max-width:100vw` trên `.cm-host`/`.markdown-preview`,
  chữ wrap `overflow-wrap:anywhere`, ảnh `max-width:100%`, bảng `display:block; overflow-x:auto`, code
  giữ cuộn trong; `.prop-key` min-width 92px + prop-row wrap. (3) Modal Settings & Version history tràn
  mép phải: `position:fixed; inset:0` full-screen, settings-nav thành strip cuộn ngang, `.setting-row`
  stack dọc + input full-width (override inline width 260/120), version-history list xếp trên preview,
  share dialog full-width; safe-area top cho nav/head. Build web sạch (7.4s).
- 2026-06-11 (Commit message mô tả): commit vault tự sinh title nêu rõ note nào đổi thay vì
  "WebObsidian auto-sync" chung chung. `describeChanges(StatusResult)` gom file theo Added/Modified/
  Deleted/Renamed → subject 1 dòng (`Add <note>` / `Sync N notes (3 new, 2 edited): a, b, c +X more`)
  + body liệt kê từng path (cap 100). `commitAll()` dùng subject tự sinh khi không có message tay;
  bỏ message generic ở autosync/auto-commit-on-save/nút Commit. Phục vụ cả Version History UI.
- 2026-06-11 (Phase 21 — Pane ⋯ menu parity): bổ sung tính năng menu 3-chấm góc phải note cho khớp
  Obsidian app (theo yêu cầu người dùng). Mới: **Find/Replace** trong note (`@codemirror/search`,
  panel top, item "Find…" → `editorFind()`); **Reveal file in navigation** (`store.revealInTree`
  mở folder tổ tiên + scrollIntoView + flash, FileTree nghe `wo-reveal-file`, row có `data-path`);
  **Add file property** (chèn key rỗng vào frontmatter YAML, tạo block nếu chưa có); **Export to PDF**
  (Reading view → `window.print()` + CSS `@media print` chỉ in nội dung note); **Open version history**
  (server `git.log`/`git.showFile` + routes `/api/git/log|/show`, modal `VersionHistory.tsx` list
  commit + preview + Restore); **Open in new window** (`window.open(/note/<path>)`); **Backlinks in
  document** + **Open linked view** submenu (→ `setRightPanel`). Menu dựng lại theo thứ tự nhóm của
  Obsidian Desktop. Bỏ qua "Reveal in Finder"/"Open in default app" (desktop-only, không hợp web).
  Typecheck sạch cả 2 workspace. PRD bump 0.6 (FR-2/FR-4).
- 2026-06-11 (Deploy hardening cho open-source self-host): rà soát các điểm gãy khi deploy lên VPS
  sạch (gặp thực tế khi deploy lên Synology NAS). (1) `docker-compose.yml` hardcode `./sample-vault`
  + port → người tự host phải sửa file tracked, và mỗi lần redeploy clobber. Fix: chuyển sang
  `${VAULT_HOST_PATH:-./sample-vault}` / `${HTTP_BIND}:${HTTP_PORT}` / `${WEBOBSIDIAN_WATCH}`, tham số
  để ở `.env` (git-ignored) → redeploy không mất cấu hình. (2) Watcher `ENOSPC`: VPS sạch
  `fs.inotify.max_user_watches=8192` < số file vault lớn → native watch chết. Fix: tách `startWatcher()`,
  thêm `.on('error')`, đụng `ENOSPC/EMFILE` thì tự `close()` + restart ở chế độ `usePolling`, log hướng
  dẫn nâng sysctl; env `WEBOBSIDIAN_WATCH=polling` ép polling từ đầu. (3) `.env.example` viết lại theo
  luồng docker thật. (4) healthcheck `start_period=90s` cho index vault lớn lần đầu. README thêm mục
  "Deploy to a VPS" + lệnh sysctl. PRD ↑0.6, FR-9 mở rộng. typecheck server pass.
- 2026-06-15 (Git Sync fix — `index.lock` wedge / "phế hoàn toàn"): bug Git Sync chết hẳn → log lặp
  `fatal: Unable to create '/vault/.git/index.lock': File exists`. Root cause: **3 nguồn chạy git
  đồng thời trên CÙNG repo, không phối hợp**: autosync tick (30s), debounced commit-on-save (5s sau
  khi lưu), và route `/api/git/*` thủ công. Mỗi `git()` tạo **instance simple-git mới** nên task-queue
  per-instance không serialize chéo → 2 `git add .` đụng nhau trên `.git/index.lock`; 1 lệnh bị kill/
  crash giữa chừng để lại **stale lock** → mọi op sau đó chết vĩnh viễn. Fix (server/src/services/git.ts):
  (1) **`withGitLock`** — 1 async queue toàn cục, mọi op ghi (status/pull/push/commitAll/init/clone/sync)
  đi qua, không bao giờ overlap; op lỗi không "đầu độc" queue. Tách hàm public (wrap khoá) khỏi `*Impl`
  (chạy trong khoá, gọi nhau trực tiếp để khỏi deadlock). (2) **`clearStaleLocks`** ở đầu mỗi op — xoá
  `index.lock`/`HEAD.lock`/`config.lock` nếu mtime cũ ≥15s (đủ rộng để không giật lock của Obsidian-git
  ngoài đang chạy, đủ nhanh để tự lành sau crash). (3) **`timeout.block: 120s`** cho simple-git để op
  mạng chết không treo queue mãi. Prod (Synology): tìm thấy `index.lock` 0 byte, mtime cũ ~10h →
  xoá → `git status` chạy lại → `/api/git/sync` = `{ok:true, [Committed, Pulled, Pushed]}`. Deploy bản
  fix để không tái phát. Typecheck 2 workspace sạch.
- 2026-06-11 (Git Sync fix — `spawn EBADF`): bug "Git Sync ko chạy được" → lỗi `spawn EBADF`. Root
  cause KHÔNG ở git: **chokidar v4** trên macOS watch từng file qua kqueue → giữ **1 fd/file**, vault
  ~11k file làm process mở ~11k fd; khi `simple-git` spawn `git`, libuv hết fd dựng pipe stdio →
  `spawn EBADF` (repro: giữ 11k fd rồi spawn = đúng lỗi). Fix: hạ **chokidar ^3.6.0** (FSEvents trên
  mac = 1 fd cho cả cây; inotify per-dir trên Linux/Docker) → fd 11.003 → ~20. Thêm `--allow-unrelated-
  histories` vào `pull()` (vault init local vs remote có sẵn commit). Logging `[git]` ở routes + autosync
  (cho monitor). UI: log `<pre>` → **textarea cuộn, tích lũy, timestamp + Clear** (Settings ▸ GitHub Sync);
  nút **Sync now** trên Ribbon trái (chỉ hiện khi bật git sync, icon xoay khi sync, lỗi → notify).
  Reconcile 1 lần vault↔obsvault.git (lịch sử tách rời): union không mất dữ liệu (`merge -s ours
  --allow-unrelated-histories` nối lịch sử + restore 2.646 file chỉ-có-remote, local thắng khi trùng).
  Verify: `/api/git/sync` → `{ok:true, [Committed, Pulled, Pushed]}`, HEAD==origin/main, 0 file mất ở
  cả 2 phía. Backup refs `backup/pre-union-{local,remote}` trong vault (xóa được sau khi yên tâm).
- 2026-06-11 (Phase 19 — Mobile UI): làm mobile-friendly cho smartphone cảm ứng (tham chiếu Obsidian
  Mobile). `useIsMobile` (matchMedia 768px) + state cục bộ `mobileDrawer` (KHÔNG persist/broadcast →
  không đụng uistate sync desktop). CSS `@media ≤768px`: workspace full-width, ribbon+sidebar trái và
  right sidebar thành drawer overlay trượt (translateX) + backdrop mờ; hamburger (☰) trên tab-bar +
  edge-swipe mép trái/phải mở/đóng drawer; auto-đóng drawer khi mở note; touch targets ≥36–44px; ẩn
  crumbs+split để view-header không tràn; status bar ẩn nhường chỗ toolbar. Format toolbar `FormatToolbar`
  dùng chung qua `lib/activeEditor` (singleton EditorView): 14 nút bold/italic/heading/list/checklist/
  quote/link/[[ /code/tag/indent/outdent/undo/redo. Theo phản hồi người dùng: **bật cả trên desktop**
  (thanh in-flow dưới view-header); mobile neo trên bàn phím qua visualViewport. Viewport
  `viewport-fit=cover` + `interactive-widget=resizes-content` + safe-area insets. Verify Chrome
  390×844: drawer trái/phải trượt+backdrop, hamburger, toolbar Bold ghi `**` + Undo khôi phục, Reading
  ẩn toolbar; desktop 1440 không regression + toolbar Bold/Undo OK. typecheck + build web sạch.
- 2026-06-11 (đợt 5): đổi kiến trúc Reading mode theo yêu cầu — Reading = Live Preview editor
  readonly (một renderer duy nhất), kèm chevron fold callout + syntax highlight code (CM grammar)
  cho pipeline Preview còn lại. Verify: reading là .cm-editor contenteditable=false, callout/
  checkbox/fold/code/math/footnote/HTML render y hệt Live.
- 2026-06-11 (đợt 4): Reading mode parity với Live — dùng chung callout constants, KaTeX +
  mermaid + highlight + tag pill + comment strip + breaks:true + callout fold trong Reading.
  Debug sanitize bằng node repro: a.className bị defaultSchema giới hạn giá trị → filter entry.
  Verify Reading: 4 tag pill, 2 mark, 8 internal-link, 3 katex, 1 mermaid svg, 1 callout gập,
  17 icon callout.
- 2026-06-11 (đợt 3): sửa 4 lỗi editor (HTML table, inline footnote, code block padding +
  indented code guide, embed note title/khoảng trắng) + đồng bộ Reading mode với Live
  (task custom states, bullet, properties pill). Verify cả 2 chế độ bằng screenshot.
- 2026-06-11: Phase 18 đợt 2 — sửa 11 lỗi render người dùng báo khi đối chiếu note "Markdown Test"
  side-by-side với Obsidian app (M18.10): highlight style riêng hết màu đỏ escape; embed note
  transclusion thật + box "could not be found"; indent guides; quote lồng nhiều thanh; checkbox
  trong callout; callout fold +/- hoạt động (gập mặc định với -, toggle bằng chevron); code block
  màu palette Obsidian + nhãn ngôn ngữ; display math $$ render (KaTeX); HR hết margin thừa;
  inline-HTML line + mermaid render thật (lazy); block comment %% xám toàn khối. Thêm deps:
  katex, mermaid, @codemirror/language-data (đều lazy-load chunk riêng). Verify từng mục bằng
  screenshot Chrome trên vault thật; typecheck + build sạch.
- 2026-06-10: Phase 18 — sao chép markdown editor Obsidian Desktop theo docs/obsidian-desktop-internals.md.
  CSS token verbatim (accent HSL + ramp + heading sizes + bold-modifier 200 + callout RGB slots);
  DOM class chuẩn HyperMD-*/cm-*; LP thêm highlight/comment/math(KaTeX)/footref/blockid/HR/
  ẩn fence + escape; callout đủ 14 slot màu + icon lucide + title mặc định; wikilink luật §7
  (alias | đầu, NBSP+NFC, size param ảnh, label raw Note#Head); tag charset unicode chuẩn;
  hotkeys §4 (Mod+B/I/K/L/D, Mod+/, Mod+E, Alt+Enter, list continuation); suggester [[ + #
  với fuzzy scoring port nguyên công thức §9; line spacing đối chiếu app.css thật
  (heading padding-top --p-spacing, inline-title 0.5em). Verify Chrome vault thật side-by-side
  với Obsidian app: heading/highlight/tag pill/callout/task/code/footnote/math/suggester khớp;
  typecheck + build sạch; note test đã xoá.
- 2026-06-03: Khởi tạo PRD.md, IMPLEMENTATION_PLAN.md, CLAUDE.md.
- 2026-06-03: Hoàn tất Phase 0–10. Backend (auth, vault, QMD search, links/graph, git+LFS,
  API gate, plugins) + frontend Obsidian-like (ribbon/sidebar/tabs/editor/reading/search/
  backlinks/outline/graph/settings/command-palette). Build web+server sạch, typecheck pass.
- 2026-06-03: Smoke test pass — login, file tree, full-text + fielded search, backlinks,
  tags, agent API (list/read/write/append/search, 401 no-key, 403 sai scope), SPA served,
  git status (LFS available). Screenshot UI xác nhận editor + reading view + callout +
  properties + wikilinks render đúng.
- 2026-06-04: Phase 12 — Live Preview WYSIWYG, embeds/transclusion, context menu, drag&drop +
  paste image, quick switcher + hotkeys, bookmarks/recent/daily note, split pane,
  git auto-commit-on-save, code-split bundle.
- 2026-06-04: Phase 13 — đại tu UI theo phản hồi: bộ icon Lucide flat thay emoji, default Light
  theme, file tree chevron-only, vault footer, status bar góc phải, "Linked mentions". Screenshot
  đối chiếu ảnh Obsidian thật: editor light + properties block + linked mentions khớp.
- 2026-06-04: Resolve attachment/ảnh kiểu Obsidian: thêm file index toàn vault (basename→path,
  shortest-path); route /content fallback theo basename khi path không khớp. Image generic theo
  protocol — URL trình duyệt load được (http(s)/data/blob/file) load thẳng, còn lại (path tương đối
  hoặc bất kỳ scheme nào) resolve theo basename qua file index. Áp cho cả Live preview lẫn Reading.
  Verify: ảnh hiển thị inline (naturalWidth>0). Watcher cập nhật index khi add/unlink.
- 2026-06-04: Khắc phục OOM trên vault lớn (5.9k note): build index không giữ toàn bộ doc, cap body
  100k, debounce link-graph + loadTree, NODE_OPTIONS=--max-old-space-size=4096 (Dockerfile).
- 2026-06-04: Live Preview render Markdown chuẩn còn thiếu: link `[text](url)` (ẩn URL, click mở
  external/internal), ảnh `![alt](url)` (http/relative → <img>, scheme lạ như trilium-att:// →
  placeholder "🖼 tên"), URL có dấu cách. Thêm overlap-guard cho replace decoration (chống crash).
- 2026-06-04: Viết lại Graph view: canvas 2D + d3-force (Barnes-Hut), pan/zoom, hover/zoom mới hiện
  label, click mở note, mặc định ẩn orphan (689/5929 node có liên kết) + toggle. Hết lag. Sửa layout
  full-height (theme wrapper) + status bar neo vào đáy workspace (không đè right sidebar).
- 2026-06-04: Trỏ WebObsidian vào vault Obsidian thật `/Users/xnohat/ObsidianVault-Trilium`
  (5928 md, 27k files, 5.5GB). Ẩn dotfiles trong tree, folder mặc định thu gọn, con trỏ khởi tạo
  sau frontmatter, Properties render YAML list thành pill. Screenshot khớp ảnh Obsidian thật.
- 2026-06-04: Phase 14 — viết lại Live Preview thành WYSIWYG thật (heading/bold/italic/code/tag/
  callout render, ẩn syntax, chỉ lộ token tại con trỏ; sửa lỗi oneDark trên light). Thêm menu
  chuột phải editor (Format/Paragraph/Insert submenu + clipboard + search), mở rộng menu file tree,
  menu reading view. Screenshot xác nhận: bold render đậm khi con trỏ ở đoạn khác, submenu Format hiện đúng.
- 2026-06-04: Sửa render Markdown lệch Obsidian: (1) syntax Obsidian/wikilink/embed nằm trong inline
  code/code block (vd `` `![[file]]` ``) bị biến thành link — nay giữ literal ở cả Live (skip regex khi
  trùng node InlineCode/FencedCode/CodeBlock từ syntaxTree) lẫn Reading (stash code span trước khi
  preprocess, restore sau). (2) Bảng Markdown chưa render ở Live — thêm scanTables + TableWidget qua
  StateField `tableField` (block widget như frontmatter), inline render trong cell (code/bold/italic/
  link), lộ raw khi con trỏ trong bảng; plugin skip dòng thuộc bảng đã render để tránh chồng decoration.
  Verify: typecheck + build sạch, scanTables nhận đúng bảng README (header Type/Count, 10 dòng).
- 2026-06-05: Live Preview khớp Obsidian thêm: (1) external link http(s) có icon ↗ (SVG lucide) +
  gạch dưới; internal link/wikilink gạch dưới; link widget `inline-block` để text dính sau `]]` vẫn
  wrap được như Obsidian. (2) List: thu gọn khoảng trắng thừa sau marker (`-   Item`→`• Item`,
  `1.  x`→`1. x`). (3) Blockquote dùng màu chữ normal (trước bị muted). (4) Render HTML block thô
  (bảng CKEditor/Trilium `<table>`) qua StateField `htmlBlockField` + sanitize (bỏ script/on*/js: URL),
  click link trong HTML mở external/internal; plugin skip dòng trong HTML block đã render. Verify bằng
  Chrome DevTools trên vault thật: icon ↗ + gạch dưới link, list 1-space, blockquote chữ đậm, bảng HTML
  "Điểm Mạnh/Điểm Yếu" render kèm bullet + link tiktok/Google. Lưu ý: app Obsidian đang mở trên cùng
  vault tự convert vài bảng HTML→markdown và xoá file scratch giữa session — không phải do WebObsidian
  (server read/write nguyên văn, code chỉ thêm decoration).
- 2026-06-05: Tinh chỉnh theo phản hồi: (1) Bảng markdown render `<br>` trong cell thành xuống dòng
  (appendInline thêm token `<br>`), header căn trái + valign top + style theo Obsidian table CSS vars
  (cả Live lẫn Reading). (2) Blockquote: viền trái màu tím `--interactive-accent` + padding-left 24px;
  fix bug padding bị CodeMirror `.cm-line` override bằng selector chuyên biệt `.cm-line.cm-blockquote`
  (tương tự `.cm-callout`) → chữ không còn dính vào viền. Verify Chrome DevTools: br=3 trong cell, th
  căn trái, blockquote border rgb(120,82,238) + padding 24px. Phải restart server 2 lần (minisearch
  vacuuming crash + OOM khi reindex lúc reload) — bug có sẵn, không liên quan thay đổi này.
- 2026-06-05: Table editor tương tác kiểu Obsidian (TableWidget viết lại). Cell click-to-edit
  (contenteditable lồng trong widget, focus hiện raw, blur/Enter commit; Escape huỷ), mỗi thao tác
  re-serialize model → replace range nguồn → tableField rebuild (DOM luôn đồng bộ). Hover hiện nút
  +column (cạnh phải) / +row (đáy). Chuột phải cell mở menu format (inject openContextMenu của store qua
  setLivePreviewMenuHandler): insert column trái/phải, insert row trên/dưới, move column/row, align
  column trái/giữa/phải (submenu), delete column/row. Bảng giờ LUÔN render widget (bỏ reveal-raw khi
  chọn) giống Obsidian — sửa nội dung qua cell, sửa raw qua Source mode. Verify Chrome DevTools trên
  note "Test Table": edit cell ghi đúng GFM ra file, +column 4→5, context menu đủ mục, delete column 5→4.
- 2026-06-05: Inline title (tên note) kiểu Obsidian hiện đầu thân note ở Live (block widget `inlineTitleField`
  ở pos 0, title bơm qua `setNoteTitle` từ Editor) lẫn Reading (Preview prepend `.inline-title`). Dedup:
  bỏ qua nếu note mở đầu bằng `# <tên>` trùng title (note Trilium lặp tiêu đề thành heading) → không hiện 2
  lần. Verify: "Test Table" (không heading) hiện title; "Trilium System Notes" (có `# Trilium System Notes`)
  KHÔNG hiện inline title (chỉ còn heading).
- 2026-06-05: Property editor tương tác kiểu Obsidian (FrontmatterWidget viết lại). Header "Properties",
  mỗi prop: icon theo kiểu (text=T / list=≣ / date=🗓 / number=# / checkbox=☑), key + value
  contenteditable (Enter/blur commit), list (tags/aliases/[...]) hiện pill có nút × xoá + nút "+" thêm
  item, nút × xoá prop khi hover, "+ Add property". Mỗi thao tác parse→serialize YAML→replace block
  frontmatter [0,blockEnd]. Frontmatter giờ LUÔN render widget (bỏ reveal-raw) giống Obsidian. Có quoting
  YAML khi value chứa ký tự đặc biệt. Verify Chrome DevTools: README hiện title/created icon đúng, Add
  property ghi `property:` ra file rồi xoá sạch, Trilium System Notes hiện aliases dạng pill + add.
- 2026-06-05: Property name suggester (dropdown) kiểu Obsidian khi Add property. Server: QmdEngine
  gom frontmatter key→type toàn vault (`propMeta` map, persist/restore cùng index), endpoint
  `GET /api/properties` trả {key,type,count} sort theo count; `inferPropType` phân loại
  text/list/number/checkbox/date/datetime, core props (tags/aliases/cssclasses) luôn = list và luôn
  có trong gợi ý. Web: `api.properties()` + inject `setLivePreviewPropertyProvider`; nút "+ Add property"
  mở input + dropdown lọc theo tên (loại key đã có), chọn gợi ý tạo prop đúng kiểu (list→pills). Fix:
  readProps loại trừ `.prop-newrow` (trước bị commit nhầm cả tên đang gõ). Verify Chrome DevTools:
  /api/properties trả 76 key (created 5938, aliases 5937…), dropdown lọc "tag"→tags/tag/taskTagNote,
  chọn "source" thêm đúng 1 prop ra file rồi xoá sạch. Phải xoá data/qmd-index.json + reindex để có propMeta.
- 2026-06-05: Hoàn thiện 3 mục còn lại. (1) Ổn định server: tắt minisearch `autoVacuum` (nguồn crash
  TreeIterator.dive khi discard/replace) ở newIndex + loadJSON; thêm guard process uncaughtException/
  unhandledRejection (log, không chết). (2) Table handle: thanh chọn cột (mép trên th) + hàng (mép trái
  ô đầu) — hover highlight cả cột/hàng (.cm-cell-hl), click mở menu format đúng phạm vi. (3) Property
  type registry kiểu Obsidian: service đọc/ghi `.obsidian/types.json` (format {types:{key:type}},
  text/multitext/number/checkbox/date/datetime/tags/aliases) + route GET/POST `/api/property-types`;
  web inject registry, chuột phải key/icon → menu "Property type" (6 kiểu, ✓ kiểu hiện tại) + Copy value
  + Remove; đổi kiểu persist types.json, nếu đổi list-ness thì convert YAML scalar↔list rồi commit, còn
  lại đổi icon tại chỗ. Verify Chrome DevTools: menu hiện đủ + ✓ Date&time cho created; đổi title→List ghi
  types.json {"title":"multitext"} + YAML thành list, revert→Text sạch; handle highlight 3 ô + mở menu.
- 2026-06-05: Value input theo property type (như Obsidian). `makeScalarField(dt,value)` dựng control
  đúng kiểu: text=span contenteditable, number=`<input type=number>`, checkbox=`<input type=checkbox>`,
  date=`<input type=date>`, datetime=`<input type=datetime-local>`. Mỗi field giữ `dataset.raw` =
  giá trị YAML chuẩn (readProps đọc raw → field không đụng tới không bị ghi đè, vd timestamp
  `…:48.273Z` giữ nguyên khi chỉ hiện `19:23`). Đổi kiểu scalar↔scalar swap control tại chỗ (fix: trước
  chỉ đổi icon). Verify Chrome DevTools: created→datetime picker (raw giữ giây/Z), dateNote (Obsidian set
  datetime trong types.json) cũng ra datetime picker — interop 2 chiều; cycle dateNote qua
  number/checkbox/date/text/datetime input đổi đúng; README sạch, types.json khớp.
- 2026-06-05: List property (tags…) sửa/thêm value kiểu Obsidian. Pill giờ contenteditable (click sửa,
  blur commit) + nút × xoá; nút "+" mở ô gõ + dropdown gợi ý value (tag vault qua `setLivePreviewTagProvider`
  → /api/tags, 1302 tag), lọc realtime, chọn hoặc Enter để thêm. Bỏ cap 12 ở Add-property suggester (giờ
  hiện hết ~72 key, cuộn được) — sửa khiếu nại "props ít". Dropdown value dùng position:fixed append body,
  anchor dưới input bằng getBoundingClientRect (sửa lỗi UI: trước bị đẩy xuống tạo khoảng trống + dropdown
  văng sang phải). flushActive trong mutate để không mất edit dở khi có thao tác khác. Verify Chrome
  DevTools: gap 0px, dropdown thẳng dưới input, lọc "linu"→linux/linuxjournal, chọn→`tags: - linux` ra
  file, sửa pill linux→linuxedit persist, xoá sạch; Add-property dropdown 72 mục.
- 2026-06-05: Graph view chuyển từ modal độc lập → mở trong workspace tab như Obsidian (sentinel
  path `graph://view`, render trong Workspace khi activePath là graph; setGraph/openGraph thêm-hoặc-
  kích-hoạt tab, lưu cùng workspace state). Thêm panel Filters overlay kiểu Obsidian (collapse từng
  section): Filters (search files, Tags/Attachments/Existing files only/Orphans toggle), Groups
  (New group: màu + query → tô node khớp), Display (Arrows, Text fade, Node size, Link thickness,
  Animate), Forces (Center/Repel/Link/Link distance slider 0..1 map sang d3-force). Backend mở rộng
  `graphData()`: trả node kèm `kind` (note/attachment/unresolved) + `tags`, sinh node attachment cho
  embed file đính kèm và node unresolved cho wikilink chưa có file → toggle hoạt động thật;
  buildLinkGraph lưu thêm rawLinks + tags. graphSettings persist qua /api/uistate. typecheck + build
  web sạch (414 modules).
- 2026-06-05: Fix Tags toggle gây trắng trang. Nguyên nhân: server 8787 đang chạy bản dist CŨ
  (chưa có tags) → `n.tags` = undefined; client làm `for (const tag of n.tags)` ném "undefined is not
  iterable" đồng bộ trong useEffect → React unmount cả cây (trắng, refresh không cứu vì tags:true đã
  persist). Sửa client: guard `n.tags ?? []` + bỏ qua node không tags, phân giải link sang tham chiếu
  node-object (loại bỏ khả năng forceLink ném "missing node"), bọc toàn bộ build trong try/catch →
  hiện overlay "Reset filters" thay vì trắng trang. Rebuild server (tsc) + restart `node
  server/dist/index.js` (PORT=8787 DATA_DIR=./data ALLOWED_ROOTS=/Users/xnohat; vault thật từ
  settings.json, log "sample-vault" là defaultVaultPath gây hiểu nhầm). Verify qua CDP (port 9223) trên
  vault thật: /api/graph trả 22718 node kèm kind+tags (3085 node có tag), bật Tags → tagsOn=true, KHÔNG
  lỗi/không crash, orphan 2533→1213 (note nối vào tag node). typecheck + build web+server sạch.
- 2026-06-05: Fix hiệu năng — server ghim ~88% CPU liên tục + Files panel kẹt "Loading...". 3 nguyên
  nhân O(toàn vault) chạy lặp: (1) chokidar KHÔNG ignore `.obsidian` → app Obsidian mở cùng vault ghi
  workspace.json/state liên tục → mỗi event broadcast `fs` → client refetch cả tree. (2) `listTree`
  `fs.stat()` từng file → 27k syscall mỗi lần fetch tree (UI không dùng size/mtime). (3) onChange + API
  reindex gọi `buildLinkGraph()` đọc+parse lại toàn bộ 5938 note mỗi lần 1 file đổi. Sửa: ignore
  `.obsidian` trong watcher; bỏ `fs.stat` trong listTree (chỉ dùng dirent); thêm
  `updateLinkGraphForFile(rel, removed)` cập nhật graph TĂNG TIẾN 1 file (watcher onChange + reindex
  của PUT content/rename/delete đều dùng; agent + /api/reindex vẫn full vì hiếm). Verify CDP trên vault
  thật: CPU 88%→0% idle, /api/files/ ~190ms, Files panel hết "Loading" (38 row). RSS ~1.1GB ổn định
  (MiniSearch + index, không tăng). typecheck + build server sạch.
- 2026-06-05: Graph nâng chất lượng + tương tác theo phản hồi (so Obsidian). (1) Click TAG node →
  search notes: store thêm `searchFor(q)` (set leftPanel=search + searchQuery), SearchPanel adopt
  searchQuery; GraphView onUp: note→openFile, tag→`searchFor('tag:'+name)`. Verify API: tag:license→50
  hits (note đầu "12min Lifetime License" khớp Obsidian), tag:Android→40. (2) Zoom mượt: bỏ React
  onWheel (passive, preventDefault bị bỏ qua) → native listener {passive:false}, scale liên tục
  `exp(-deltaY*speed)` thay vì bước cố định 1.1×; ctrlKey=pinch amplify. (3) Đồ hoạ sắc nét hơn: node
  radius đổi sang sqrt `(1.5+√deg*0.9)*(0.4+size)` (hết blob khổng lồ), thêm viền nền quanh node tách
  bạch, edges nhạt hairline (alpha 0.18+), label có halo nền (strokeText) dễ đọc. (4) Hiệu năng zoom:
  cull edge ngoài viewport (skip nếu 2 đầu cùng phía ngoài màn hình). typecheck + build web sạch.
- 2026-06-05: Graph layout & label fade theo phản hồi: (1) tăng lực đẩy (charge −66→−120), hub đẩy
  mạnh theo √deg, link dài hơn (67→100), distanceMax 480→1400, center nhẹ hơn, collide theo bán kính
  thật → graph nở thoáng, hết "hairball". (2) Line mảnh lại + đậm màu (đổi sang --text-faint, alpha
  ~0.7). (3) Label fade theo zoom (hub hiện trước, note nhỏ chỉ hiện khi zoom gần) thay vì hiện hết.
- 2026-06-05: Đổi renderer graph từ canvas-2D (CPU) sang **PixiJS WebGL (GPU)** như Obsidian (user
  chọn). Pixi v8 dynamic-import (chunk 246KB gzip, chỉ tải khi mở graph; bundle chính vẫn ~40KB).
  Kiến trúc: node = Sprite (texture tròn dùng chung, tint theo màu/nhóm, scale theo bán kính), edges =
  Graphics, label = lớp Text screen-space riêng (pool ≤400, halo nền, fade theo zoom). Pan/zoom = biến
  đổi camera trên world Container (world.position/scale) → KHÔNG vẽ lại hình học, mượt bất kể số node;
  chỉ vẽ lại geometry khi sim tick. Render on-demand (ticker.stop + app.render qua rAF batch). Giữ
  nguyên d3-force + panel Filters/Forces + click tag→search. Verify CDP vault thật: WebGL context sống
  (không lost), 0 lỗi console, scene rebuild đúng khi đổi filter (tags off→1258 node), screenshot xác
  nhận vẽ node/edge/label sắc nét. typecheck + build web sạch.
- 2026-06-06: Tinh chỉnh graph WebGL khớp Obsidian (qua nhiều vòng screenshot CDP): (1) Node size:
  sqrt CÓ CAP `(3+min(√deg,11))*(0.45+size)` → hub tag chỉ ~3.5× note (trước ~9×, blob khổng lồ),
  note có base nhìn rõ. (2) Label: ngưỡng theo bán kính màn hình hạ thấp + **greedy tránh chồng**
  (sort hover→deg, bỏ label nào đè label đã đặt, tối đa 220) → label sạch như Obsidian, hiện đúng tầm
  zoom thay vì hiện muộn/đè nhau. (3) Auto-fit theo VÙNG LÕI (median center + percentile 82% bán kính,
  bỏ outlier cụm orphan bay xa) → mức zoom mặc định hợp lý, không co graph thành chấm giữa màn hình;
  fit định kỳ khi đang dàn, dừng khi user pan/zoom. (4) Edge giữ ĐỘ DÀY CỐ ĐỊNH trên màn hình
  (width=base/k, vẽ lại khi zoom; pan vẫn thuần transform) → hết bị thành thanh xám to khi zoom sâu.
  Verify CDP nhiều mức zoom: line mảnh đều, label rõ không chồng (note+tag), node cân đối, tag cyan
  click→search. typecheck + build web sạch.
- 2026-06-06: Label theo phản hồi "hiện muộn + mờ": hạ ngưỡng rMin (1.1−fade) → label hiện ngay ở mức
  zoom fit mặc định; font 11→13 + fontWeight 600 + màu --text-normal (đậm/đen) + halo width 4 + ramp
  alpha nhanh → hết mờ. Verify CDP: ở cả mức fit lẫn zoom +2, label đậm-đen-to, không chồng (greedy
  vẫn tránh đè), hiện đầy đủ tag + tên note như Obsidian.
- 2026-06-06: Label fade mượt theo zoom như Obsidian: nới vùng ramp alpha (over ~4.5px bán kính màn
  hình) → label hiện mờ ở zoom xa rồi từ từ rõ dần khi zoom vào, hub rõ trước, note nhỏ rõ sau. Verify
  CDP: mức fit label mờ/đa cấp opacity, zoom +4 label rõ-đậm hoàn toàn.
- 2026-06-10: Navigation back/forward kiểu Obsidian (M9.10). Store thêm history stack (`history`/
  `histIndex`, cap 100) + `goBack`/`goForward`; openFile/openGraph push entry qua `pushHistory` (cắt
  nhánh forward, bỏ qua khi đang replay nhờ cờ `navByHistory`). View-header giờ render cho MỌI view
  (trước chỉ markdown) với 2 nút ←/→ góc trái, disabled+mờ khi hết chỗ lùi/tới; Graph view cũng có
  toolbar. Icon thêm arrow-left/arrow-right. typecheck cả 2 workspace + build web sạch.
- 2026-06-10: Search panel thêm filter/sort + sticky (M9.11). Khung query (input + nút match-case
  "Aa" + clear + options) gộp 1 box bo viền, `.search-head` `position: sticky; top:0` trong
  `.sidebar-body` → KHÔNG trôi khi cuộn kết quả (fix khiếu nại). Options panel (toggle qua nút
  sliders): Collapse results (ẩn snippet), Show more context (bỏ line-clamp). Dropdown Sort:
  Relevance (mặc định = thứ tự server) / File name A→Z / Z→A / Path — sort client-side. Match case
  lọc client theo free-text (bỏ operator tag:/path:). Nâng limit 50→100. Lưu ý: sort theo Modified/
  Created time CHƯA làm — search index không lưu mtime/ctime, cần thêm field server + reindex.
  typecheck + build web sạch. Chưa verify live (browser profile CDP đang bị chiếm).
- 2026-06-10: Bỏ cap cứng 100 kết quả search (phản hồi "tại sao luôn 100?"). Server: route bỏ
  Math.min(...,100), `limit<=0`/omitted → trả MỌI match; QmdEngine.search slice chỉ khi limit>0
  (agent API vẫn truyền limit nên không đổi). Client: api.search bỏ default 100 (gọi không limit),
  SearchPanel render TĂNG DẦN 50/lần qua IntersectionObserver (sentinel + rootMargin 300px), reset
  về 50 khi đổi query/sort/match-case, hiện "Showing X of Y…". Đếm giờ đúng tổng thật. Verify API
  trên vault thật: q=nginx → 166 hit (trước cắt 100), limit=100 vẫn cap 100. Restart server dist mới.
  typecheck + build web+server sạch.
- 2026-06-10: Fix khe hở phía trên khung search (kết quả lú ra trên ô tìm). Bỏ `position: sticky`
  trên `.search-head` (sticky trong `.sidebar-body` có padding-top → khe). Thay bằng layout cố định:
  `.search-panel` height 100% flex-column, `.search-head` flex-shrink:0 (đứng yên), `.search-results`
  flex:1 + overflow-y:auto tự cuộn riêng → đầu danh sách không thể đè lên khung. IntersectionObserver
  đổi root sang `.search-results` (ref) thay vì viewport. typecheck + build web sạch.
- 2026-06-10: Phase 16 (FR-10) — deep-link URL + public share. URL `/note/<path>` sync 2 chiều
  với tab đang mở (module `web/src/lib/urlsync.ts`: pushState khi đổi note, popstate → openFile,
  lần sync đầu replaceState; deep-link thắng workspace restore). Share public: `data/shares.json`
  (1 record/note, token 16-byte base64url), `/api/shares` CRUD + toggle enabled, `/public/shares/:id`
  trả {title, content} không lộ path, `/public/shares/:id/file` chỉ serve đúng file note nhúng
  (`![[...]]`/`![](...)`, resolve theo basename như files API, chặn `.md`). Trang `/share/<id>`
  render Reading view standalone (main.tsx branch trước App, không auth), wikilink trơ. UI: context
  menu "Copy public link" (FileTree), Settings → tab Sharing (search, Copy link, Disable/Enable,
  Delete; click path mở note). Rename note tự cập nhật share path. Verify end-to-end qua curl
  (401 file API vs 200 public, allowlist 404, disable→404, re-enable→200) + Chrome (trang share
  render ảnh nhúng trong context cô lập không cookie; deep-link mở đúng note; browser Back đổi note;
  tab Sharing hiển thị đủ controls). Typecheck + build sạch.
- 2026-06-10: M16.5 — password riêng cho từng share link. Server: `ShareRecord.passwordHash`
  (scrypt, tái dùng hash/verify của auth service; không bao giờ trả hash — API trả `hasPassword`),
  PATCH /api/shares/:id nhận {password: string|null} (set/xoá), POST /public/shares/:id/unlock
  đổi password lấy JWT cookie httpOnly scope `/public/shares/:id` TTL 12h (ảnh nhúng tự gửi cookie);
  GET content/file trả 401 {passwordRequired} khi chưa unlock. Web: PublicNote thêm form unlock
  (sai password báo lỗi, đúng → render); tab Sharing thêm nút "Password…/Password ✓" (prompt đặt/
  đổi/xoá) + badge "password-protected". Verify curl (set→401→unlock sai 401→unlock đúng→cookie
  →200 content+file, xoá password→200 lại, shares.json mode 600 chứa scrypt hash) + Chrome context
  cô lập (form hiện, sai báo lỗi, đúng mở note + ảnh load, tab Sharing đúng trạng thái).
- 2026-06-10: M16.6 — SSR + SEO cho trang share public. Server render `GET /share/:id` thành HTML
  hoàn chỉnh (route `sharepage.ts` mount trước static): nội dung note nằm ngay trong HTML (Google
  indexable, không cần JS), head đủ title / meta description (strip markdown ~160 ký tự) / canonical /
  og:type=article + og:site_name + og:title/description/url/image (ảnh đầu tiên note nhúng — URL
  tuyệt đối qua endpoint public, hoặc ảnh web đầu tiên) / twitter:card summary_large_image. Render
  bằng service `renderhtml.ts` — port pipeline unified/remark/rehype+sanitize từ web (giữ sync),
  deps thêm vào server workspace; CSS bundle của SPA được inline nên giao diện khớp Reading view.
  Share có password → SSR form unlock (noindex, không lộ nội dung/metadata; inline JS POST unlock
  rồi reload); cookie unlock đổi path '/' để cả /share/:id lẫn /public/shares/:id đều nhận. Bỏ trang
  React PublicNote (SSR thay thế), vite proxy thêm /share. Verify curl: locked → noindex + không leak,
  mở khoá → đủ meta + content + img + CSS inline, id sai → 404 noindex; Chrome context cô lập: form
  unlock sai báo lỗi, đúng → reload ra note y hệt Reading view. Typecheck + build sạch.
- 2026-06-10: Graph view — sửa layout lệch xa Obsidian (đồ thị bị tãi thành sợi, cụm rời bay
  tứ tán, hub tag thành "bồ công anh" gai): (1) thay `forceCenter` (chỉ tịnh tiến trọng tâm,
  không hút) bằng gravity thật `forceX`+`forceY` map theo slider Center force; (2) link strength
  chuyển sang adaptive kiểu d3 mặc định `slider/min(deg)` để cụm quanh hub nén thành đĩa đặc;
  (3) cap hệ số repel theo bậc (hub ~2× leaf thay vì ~8×) + distanceMax 900; (4) khởi tạo vị trí
  bằng xoắn ốc phyllotaxis thay vì cả 5.4k node trên một vòng tròn r=250; (5) link distance mặc
  định 100→50, alphaDecay 0.02; (6) node tag đổi màu xanh lá kiểu Obsidian. Verify Chrome trên
  vault thật 5.9k note: đồ thị tụ thành khối cầu liên kết với tag xanh phân bố đều, label/zoom
  ổn, console sạch. Typecheck + build sạch.
- 2026-06-10: Phase 17 (PRD 0.3) — pane menu (⋯) + đại tu Right sidebar theo phản hồi "thiếu menu
  3 chấm + thiếu chức năng sidebar phải". (1) Nút ⋯ "More options" trên view-header MỌI view:
  note = Split right/Split down + Bookmark + Copy public link + Make a copy + Rename/Move/Copy
  path/Delete + Close tab/Close other tabs; Graph = Copy screenshot (extract Pixi stage → PNG
  composite nền theme → clipboard; cần render lại vì WebGL không preserveDrawingBuffer) + Close
  tab. (2) Split pane 2 hướng: `splitDirection` right/down persist trong uistate, `.editor-area.
  split-down` flex-column. (3) Right sidebar thành tab strip icon kiểu Obsidian: Backlinks
  (Linked mentions + **Unlinked mentions**) · Outgoing links (resolved/unresolved, lọc attachment
  khỏi unresolved để không tạo nhầm note .md) · Tags (tái dùng TagsPanel, click → search tag:x
  đúng query) · Outline; `rightPanel` persist + sync. (4) Server: `/api/search/matches` thêm
  `phrase:true` → match cả cụm (unlinked mentions chính xác như Obsidian thay vì OR từng từ —
  verify curl: phrase=0 hit vs word-based=1679 trên cùng note). Icon mới: more-horizontal/rows/
  list/arrow-up-right/camera. Verify CDP trên vault thật: menu ⋯ note đủ 11 mục, Split down ra
  pane dưới có header+close, Copy screenshot → clipboard chứa image/png, tab strip đổi panel,
  unlinked mentions 30→0 sau phrase fix (title dài không xuất hiện verbatim), rightPanel khôi
  phục sau reload. Typecheck + build web+server sạch; restart server dist mới. Lưu ý môi trường:
  client cũ (bundle trước) của user đang mở /graph liên tục đẩy uistate ghi đè khi test — không
  phải bug code mới.
- 2026-06-10: Graph view — đồng bộ slider với đơn vị/mặc định gốc của Obsidian app: Text fade
  -3..3=0, Node size 0.1..5=1, Link thickness 0.1..5=1, Center force 0..1=0.52, Repel force
  0..20=10, Link force 0..1=1, Link distance 30..500=250 (map nội bộ về tham số d3 đã calibrate
  để mặc định cho ra layout như bản tune). Panel Filters mặc định collapsed — chỉ hiện cog icon
  như Obsidian. Migration: graphSettings cũ (thang 0..1) persist server-side được detect qua
  linkDistance ≤ 1 → reset display/forces về mặc định mới, giữ filters/groups. Verify Chrome:
  panel đóng + cog, mở panel slider đúng min/max/value, layout giữ khối cầu. Typecheck + build sạch.
- 2026-06-10: Graph view — port CHÍNH XÁC physics của Obsidian app bằng cách reverse-engineer
  obsidian.asar cài trên máy (sim.js = d3-force chạy trong worker + WASM, app.js = panel/renderer):
  charge = -repelSlider³ (mặc định 10 → -1000, distanceMin 30, theta .9, KHÔNG distanceMax);
  link distance = slider nguyên gốc (250); link strength = slider × 1/min(deg) (adaptive d3);
  gravity forceX/Y với strength = MJ easing (0.01^(1-e)-0.01)/0.99 → 0.52 ⇒ 0.1; collide bán kính
  cố định 60 strength 0.5; alphaDecay 1-0.001^(1/300); velocityDecay 0.4. Node radius theo
  getSize() của Obsidian: nodeSize × clamp(3√(deg+1), 8, 30). Cạnh vẽ độ dày cố định theo màn hình
  (lineSizeMult/scale) màu nhạt; node note màu xám (không phải accent). Kết quả: đồ thị co thành
  hình cầu một khối như app. Verify Chrome vault 5.9k note + typecheck/build sạch.
- 2026-06-10: Graph view — hoàn tất parity render với Obsidian app (đào tiếp renderer trong
  app.js): (1) node vẽ theo luật nodeScale = √(1/zoom) của Obsidian — bán kính màn hình =
  getSize()·√k nên zoom out node vẫn to gần chạm nhau thành đĩa tổ ong đặc, cạnh chìm phía sau
  (trước đó node co tuyến tính theo zoom → teo mất, chỉ còn thấy cạnh thành chùm "pháo hoa");
  (2) label dùng fade toàn cục textAlpha = clamp(log₂(zoom) − textFade, 0, 1) như app (mặc định:
  bắt đầu hiện sau zoom 1×, rõ hẳn ở 2×) thay vì ngưỡng theo bán kính từng node; (3) hit-test
  hover/click + mũi tên + nhân scale hover đồng bộ theo bán kính màn hình mới. Không copy code
  Obsidian — chỉ trích hằng số/công thức và viết lại trên d3-force (BSD). Verify Chrome side-by-side
  với app trên cùng vault: khối cầu cụm đặc tương đồng. Typecheck + build sạch.
- 2026-06-10: Reverse engineering toàn diện Obsidian Desktop 1.12.7 (extract obsidian.asar:
  app.js 3.6MB, app.css 588KB, main.js, worker.js, sim.js) bằng 4 agent song song. Ghi tri thức
  vào docs/obsidian-desktop-internals.md (22 mục): regex chính xác Markdown dialect (wikilink/
  callout/tag/block-id/footnote), luật link resolution 6 bước, schema đầy đủ .obsidian/* +
  workspace.json + graph.json + .canvas + .base, grammar search operators, thuật toán fuzzy có
  công thức điểm, hằng số d3-force graph (velocityDecay 0.6, repel −slider³, slider curve),
  cơ chế Live Preview/reading view (DOMPurify config, embed depth ≤5), 196 command id + hotkey
  mặc định, registry 31 core plugins, toàn bộ CSS design tokens 2 theme + DOM class + bảng
  14 nhóm callout. Dùng làm tài liệu gốc khi clone tính năng về sau.
- 2026-06-10: Graph view — sao chép hành vi viewport của Obsidian app: khởi tạo scale = 1 theo
  DEVICE pixel (CSS k = 1/devicePixelRatio), tâm spawn đặt giữa khung, KHÔNG auto zoom-to-fit
  (bỏ fitView chạy theo tick — chính nó làm mức zoom hai bên lệch nhau nên cùng một node thấy
  mật độ/khoảng cách khác nhau); node spawn "big bang" từ đĩa phyllotaxis nhỏ ở tâm và nở ra
  như app. Bật lại Orphans trong uistate đã lưu (mặc định Obsidian = on; 2.289 orphan lấp đầy
  khoảng trống giữa các cụm — thiếu chúng nên trước đó nhìn "rỗng" hơn app). Sau sửa: cùng mức
  zoom, khoảng cách node/cỡ node trùng app vì physics + luật render + viewport đều giống nhau.
  Verify Chrome zoom vào hub #FRT so với app. Typecheck + build sạch.
- 2026-06-10 (tiếp): Graph view — hoàn tất parity zoom/spacing/typography với Obsidian app
  (đào tiếp app.js + đọc toàn bộ sim.js): (1) mọi luật scale chuyển sang DEVICE pixel như app
  (bán kính node màn hình = getSize·√scale_device → trên Retina node nhỏ lại √dpr, khoảng cách
  cụm khớp app); (2) wheel zoom đúng công thức app: target ×= 1.5^(−ΔY/120), clamp [1/128, 8],
  zoom-in neo cursor / zoom-out neo tâm, scale lerp 15%/frame (mượt như app); (3) label theo
  đúng renderer app: fontSize 14 + getSize()/4, font stack ui-sans-serif…, scale = nodeScale
  (co theo √zoom như node), offset (getSize+5)·nodeScale, hover không nhỏ hơn 1/scale;
  textAlpha = clamp(log₂(scale_device) + 1 − fade, 0, 1) (trước thiếu +1 và dpr → label hiện
  muộn 4×); bỏ greedy declutter tự chế (app không có); (4) cạnh dày đúng lineSizeMult DEVICE px
  (trước dày gấp dpr lần), mũi tên fade theo clamp(2·(scale−0.3),0,1), size 2√mult/scale;
  (5) hover fade kiểu app: node/cạnh không nối với node hover mờ dần về alpha 0.2 (lerp 0.9/frame),
  cạnh nối đổi màu highlight; bỏ phóng to 1.25 khi hover (app không phóng); (6) sim.alpha(0.3)
  khi đổi forces (app post alpha .3); thêm hook window.__graphCam cho automated UI test.
  Verify trên Chrome vault thật 5.9k notes: khối cầu + vòng orphan tổ ong, label hiện đúng
  ngưỡng scale ~0.5–1, hover dim chuẩn, console sạch, typecheck + build sạch.
- 2026-06-11: Phase 20 (PRD 0.5) — Graph "Find node": ô search nổi góc trên-trái canvas, keyword
  match trên node đang hiển thị (label/path, AND mọi từ, rank tag-first>prefix>label>path+degree, top 50,
  kind tô màu tag xanh/attachment vàng/unresolved mờ + path phụ); click/Enter → flyTo: camera
  lerp pan+zoom 15%/frame (chung nhịp updateZoom Obsidian) về node ở scale ≥2, setHover highlight
  accent + dim không-liên-kết tới khi di chuột; wheel/drag hủy fly; Esc/clear đóng list. Verify
  CDP vault thật: gõ "docker" 50 kết quả đúng rank, click bay tới node centered scale 2.0, query
  tự xoá, console sạch. Typecheck + build sạch. PRD bump 0.5 (FR-2).
- 2026-06-11: M16.7 — Share dialog per-note + globe badge (phản hồi: "Copy public link" không cho
  biết note đã share). Component `ShareDialog.tsx` (modal): chưa share → nút Create public link;
  đã share → toggle pill bật/tắt, ô URL + Copy, Set/Change password, Delete link. Store thêm
  `shares` cache + `loadShares()` + `shareDialogPath` (load sau login, refresh sau mỗi thao tác);
  Settings → Sharing chuyển sang dùng store nên badge đồng bộ mọi nơi. Context menu file tree và
  menu ⋯ pane đổi item thành "Share…" (icon globe) mở dialog. File tree: note có share enabled hiện
  icon globe màu accent cạnh tên. Icon `globe` thêm vào bộ Lucide. Verify headless Chrome qua CDP
  (MCP bị phiên khác giữ): badge hiện đúng note share + màu accent, menu có "Share…", dialog mở đủ
  controls (URL đúng token, toggle on, Set password…, Delete). Typecheck + build sạch.
- 2026-09-20: Phase 21 (PRD 1.8, FR-6) — Agent API đọc–sửa an toàn + MCP server (adopt từ fork
  blueberry6401 + Absenthome). Server: `services/noteversion.ts` (`version` = sha256 nội dung, 16 hex,
  không dùng mtime), `services/noteedit.ts` (find/replace literal, `indexOf`+`split/join` để không
  hiểu nhầm regex hay `$&`; 0 khớp → `find_not_found`, ≥2 khớp không `replaceAll` → `find_ambiguous`
  + `count`), `services/notegrep.ts` (quét dòng literal, số dòng 1-based, `ranges`, `pre`/`post`,
  `count` toàn bộ + `truncated`), `vault.listMarkdownFilesSorted` (modified/created/name × asc/desc,
  dùng lại stat cache). Route `/api/v1`: `GET /notes?sort&order&folder`, `GET /notes/*?offset&limit`
  (trả `version`/`totalLines`/`hasMore`; **không** cắt ngầm khi thiếu `limit` — khác bản gốc để không
  phá client cũ), `PUT` nhận `base_version` (thiếu → last-writer-wins như trước; bật chặt bằng
  `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1`), `PATCH` nhánh `find`/`replace` (giữ nguyên nhánh `append`),
  `GET /note-matches`. Workspace `mcp-server` (stdio MCP, 10 tool: list/read/write/append/edit/grep/
  delete/search/backlinks/tags). Test: 20 unit test mới; smoke-test thêm scenario D (agent API e2e:
  create có version, đọc phân đoạn, grep, find mơ hồ 409, edit 1 chỗ, PUT version cũ 409, PUT thiếu
  version vẫn chạy), E (MCP handshake thật qua stdio, 8 tool call, conflict → isError) và F (strict
  mode). Docs: docs/AGENT_API.md viết lại (bảng endpoint + mục error + ví dụ đọc–sửa), README (§ Agent
  API + MCP), mcp-server/README.md, PRD 1.8, CHANGELOG, docs/UPSTREAM_PR_MERGES.md → "Adopted from
  other forks" (kèm danh sách fork đã khảo sát và lý do loại).
- 2026-10-15: Link preview card (issue #7, PRD 1.6) — `server/src/services/linkpreview.ts` (OG fetch SSRF-guarded, cache, provider chain, SSR `embedLinkPreviews` cho share page), route `GET /api/linkpreview`, web `lib/linkPreview.ts` (Reading view) + `LinkPreviewWidget` (Live Preview), CSS `.link-preview-card`. Verify: typecheck sạch; test thủ công parse OG, chặn loopback, fallback link thường.
- 2026-10-15: Multi-cursor & column selection (issue #10) — `Editor.tsx`: allowMultipleSelections, Alt+Click thêm cursor, Shift+Alt+Drag chọn cột (rectangularSelection), Escape về 1 cursor (simplifySelection); `livePreview.ts` `editorClickFix` bỏ qua Alt+Click để không collapse multi-cursor. Verify: typecheck sạch; test thủ công Alt+Click thêm cursor + Escape (Source mode); Shift+Alt+Drag chưa kiểm chứng.
- 2026-10-15: Hanging indent cho list/task/ordered list (Live Preview) — `livePreview.ts` (`hang()` đặt `--hang-units`/`--hang-marker-w`, class `HyperMD-hang`; ordered list: marker `1.` bọc `cm-ol-marker` rộng cố định theo số chữ số, khoảng trắng sau marker ẩn khi caret không chạm), `obsidian.css` (padding-left + text-indent âm). Không áp dụng trong quote/callout. Verify: typecheck sạch; đo pixel dòng wrap == dòng đầu cho bullet/task/lồng nhau/ordered 1–3 chữ số; trạng thái raw khi caret chạm marker ổn định.
- 2026-10-15: Highlight YAML front matter trong Source mode (issue #9) — `Editor.tsx` dùng `yamlFrontmatter` (@codemirror/lang-yaml) bọc markdown; `highlight.ts` thêm style `meta` cho `---`. Verify: typecheck.
- 2026-10-16: Trash retention (PRD 1.8) — setting `vault.trashRetentionDays` (30 mặc định), index thời điểm xoá `.trash-index.json`, purge khi khởi động/mỗi giờ/đổi setting. Verify: typecheck sạch; test thủ công — item 31 ngày bị xoá, 29 ngày giữ; file mtime 2020 vừa xoá không bị purge; folder hết hạn xoá cả cây; retention 0 giữ; giá trị sai (99999, chữ, số lẻ, âm) bị bỏ qua; UI lưu/giữ lại giá trị cũ khi nhập sai.
- 2026-10-16: Nút xoá nhanh (hover) trên hàng file tree — `FileTree.tsx` (`.tree-del`, gọi `doDelete`). Sửa lỗi nút "không phản hồi": `window.confirm()` bị chặn/tự huỷ trong trình duyệt nhúng (preview pane) nên không có prompt → thêm `lib/confirm.ts` (`confirmDialog` dạng promise) + `ConfirmDialog.tsx` (Esc/Cancel/backdrop = huỷ, focus mặc định ở Cancel); dùng cho `doDelete`/`doDeleteMany` (context menu cũng hưởng). Verify: typecheck sạch; cancel/Esc giữ file, Delete chuyển vào .trash. Xoá folder: dòng cảnh báo phụ (`detail`) "folder và nội dung (N mục) sẽ bị xoá" / "folder rỗng"; xoá nhiều mục có folder → "Folders and everything inside them will be removed.". Chưa đổi các `confirm()` khác (Settings, TrashView, VersionHistory, ShareDialog, Workspace) Fallback touch/keyboard: nút dùng `opacity` thay `display:none` (tab được, hiện khi hover/focus-within/focus-visible), `@media (hover:none),(pointer:coarse)` chỉ hiện trên hàng đang chọn (`.selected`, tap hàng để chọn; hàng khác opacity 0 + `pointer-events:none` để không chạm nhầm) + vùng chạm lớn hơn; `ConfirmDialog` bẫy Tab giữa Cancel/Delete.
- 2026-10-16: Sửa hanging indent ordered list sau khi đổi `calc()` (nhánh fix-indentations-in-lists) — `hang()` phải đặt cả `--hang-marker-w` lên dòng (box `.cm-ol-marker` dùng biến này làm width), nếu không box lấy giá trị mặc định và dòng wrap lệch 4–13px. Verify: đo pixel 15 dòng lồng nhau (bullet/task/ordered 1–2 chữ số/tab/hỗn hợp) + note cũ, tất cả thẳng hàng; typecheck sạch.
- 2026-10-16: Sửa 3 lỗi của Local attachment folders (#30) — (1) nút xoá ảnh dùng `confirmDialog` trong app thay vì `confirm()` native (bị chặn/tự huỷ trong trình duyệt nhúng nên click không phản hồi), thêm dòng cảnh báo "xoá vĩnh viễn, không vào trash"; `ConfirmDialog` bắt Esc ở mức window (Esc vẫn đóng khi focus bị editor giành lại). (2) `inThisNote` đếm đôi khi tên file không có dấu cách (`image.png` luôn bị coi là "dùng ở chỗ khác trong note" nên không bao giờ xoá file) → đếm từng cách viết (raw / %20) một lần. (3) Trang public share: ảnh `![](attachments/x.png)` giờ giữ thư mục + decode đúng một lần (`vaultTarget` trong `renderhtml.ts`) và `GET /public/shares/:id/file` + allowlist resolve tương đối theo thư mục note được share (`resolveForNote`) — trước đó chỉ lấy basename nên ảnh trùng tên ở thư mục khác bị phục vụ nhầm và tên có dấu cách bị 404 (double-encode `%2520`). Verify: typecheck/build sạch; share note-b trả đúng 150 byte (trước đó 106 byte của ảnh khác), `shared pic.png` 200; allowlist vẫn chặn file không embed, `..`, đường dẫn tuyệt đối, .md (404); og:image 200; wikilink cũ vẫn hoạt động; xoá ảnh unique xoá file + bỏ token, ảnh dùng chung chỉ gỡ tham chiếu.
- 2026-10-16: Ẩn thư mục `attachments` trong file tree (PRD 1.10) — `web/src/lib/attachments.ts` (`ATTACHMENT_DIR_NAME`, `isHiddenAttachmentFolder` = tên `attachments` không phân biệt hoa thường VÀ không chứa note/canvas ở bất kỳ cấp nào, `displayChildren`); store `showAttachmentFolders` (persist qua uistate, mặc định false); lọc trong `sortTree` (bản copy để render, tree gốc giữ nguyên nên đếm khi xoá folder vẫn gồm nội dung ẩn), `FolderView`, `FolderPicker`; `revealInTree` báo cách bật tuỳ chọn khi file nằm trong thư mục ẩn; toggle ở Settings → Vault & Files; server `vault.pruneEmptyAttachmentsDir` tự xoá `attachments/` rỗng sau khi xoá/trash file trong đó; upload dùng chung hằng số tên thư mục. Verify: typecheck/build sạch; mặc định ẩn A/attachments (chỉ ảnh) và C/Attachments (khác hoa thường), vẫn hiện B/attachments (có note) và D/attachments (canvas lồng sâu); bật/tắt tức thì + lưu qua reload; cảnh báo xoá folder đếm 3 mục gồm phần ẩn; prune: permanent/trash/hoa thường OK, thư mục còn file khác hoặc không phải attachments giữ nguyên. Ghi chú: setting `vault.attachmentDir` vẫn chưa được dùng (tên cố định `attachments`).
- 2026-10-16: Manual sort — sửa 3 vấn đề (issue #34): (1) `FileTree.tsx` vùng thả before/inside/after theo vị trí con trỏ (folder: 25% trên = trước, 25% dưới = sau nếu đang thu gọn, giữa = chuyển vào; file: nửa trên/dưới) + vạch chỉ vị trí `.drop-before/.drop-after`; dragover dùng biến module `activeDrag` vì trình duyệt thật ẩn dữ liệu dataTransfer lúc dragover; ngoài Manual hoặc khi item kéo không cùng cấp thì giữ hành vi cũ. (2) vị trí cuối: mép dưới hàng cuối, hoặc thả vào vùng trống dưới tree (item ở root → cuối thứ tự root). (3) `api.rename` có hook (`setRenameHook`) nên mọi nơi đổi tên/di chuyển (inline rename, kéo thả, Move to…, cut/paste, inline title) đều gọi `remapManualOrder` trong store: đổi tên giữ slot, folder mang theo thứ tự con (đổi key + giá trị theo prefix), chuyển folder khác thì xuống cuối folder đích; reconcile bị bỏ qua khi có rename đang chờ server để không coi item đổi tên là "xoá + mới". Verify (drag event mô phỏng, dragover dùng DataTransfer rỗng như trình duyệt thật + thao tác UI thật): vùng/vạch đúng cho file/folder; chuyển file vào folder cùng cấp ở Manual; thả mép dưới hàng cuối → cuối; rename file/folder (qua API app và inline UI) giữ vị trí và thứ tự con; move xuống cuối folder đích; rename lỗi không đổi thứ tự; chế độ sort khác không đổi hành vi; typecheck/build sạch.
- 2026-10-16: Floating scroll-aware document outline (issue #32, PRD 1.11) — `DocOutline.tsx` (parse heading bỏ qua frontmatter/code fence, marker theo cấp, active theo scroll qua `lineBlockAtHeight`, hover mở panel, click cuộn mượt), gắn trong `Editor.tsx`, style `.doc-outline` trong `obsidian.css`. Verify: typecheck sạch; chưa kiểm tra thủ công trên trình duyệt.
- 2026-10-16: Sửa click outline nổi (issue #32) cuộn thiếu ở note dài — `DocOutline.tsx` `go()` dùng `EditorView.scrollIntoView(pos, {y:'start', yMargin})` + 1 lượt chốt lại sau 150ms thay cho `scrollTo(lineBlockAt().top, smooth)`: dòng nằm xa viewport chỉ có chiều cao ƯỚC LƯỢNG tới khi được render/đo, nên offset tính một lần bị thiếu và animation smooth bị CodeMirror huỷ khi đo lại (dừng cách heading hàng nghìn px, section active sai). Verify: click chuột thật trên 5 heading (xa xuôi, xa ngược, giữa, tiêu đề trùng, gần) đều tới đúng heading + đúng section active; typecheck/build sạch.
- 2026-10-16: Outline nổi — cuộn có easing (ease-in-out cubic) khi click heading (issue #32): `DocOutline.tsx` `go()` chạy animation rAF tự viết (chậm → nhanh → chậm; thời lượng 300–900ms theo khoảng cách; tôn trọng `prefers-reduced-motion`; huỷ khi người dùng wheel/touch/click/phím hoặc khi outline unmount). Mỗi frame đi đúng phần quãng đường CÒN LẠI tính từ vị trí hiện tại tới đích, đích tính lại mỗi frame (ước lượng chiều cao dòng của CodeMirror đổi khi dòng được render/đo; khi heading đã render thì nhắm vị trí thật) → không giật khi CodeMirror re-measure và không còn cú giật cuối. Verify (click chuột thật + lấy mẫu scrollTop mỗi frame): xuống xa tốc độ 1→~130→0 px/frame ~870ms, lên xa tới H1 mượt, wheel giữa chừng dừng ngay, reduced-motion nhảy tức thì, chuyển Source giữa chừng không lỗi; typecheck/build sạch.

## 2026-10-30: adaptive toolbar, drafts and conflicts

Status: in progress. Execution order: container-sized one-row toolbar with More menu, then persistent local drafts, then version-conflict resolution. Existing explicit scroll/wrap layouts remain supported. See `docs/superpowers/plans/2026-10-30-drafts-conflicts-adaptive-toolbar.md`.

### 2026-10-30 — drafts/conflicts/toolbar implementation

- [x] Adaptive one-row toolbar measured against its editor container, with More menu and existing Scroll/Wrap compatibility.
- [x] Persistent scoped local drafts, revision-aware acknowledgements, recovery/export/discard, lifecycle integration.
- [x] CAS for normal editor saves and editable conflict comparison with explicit retry and create-only copies.
- [ ] Manual actual browser zoom 125/150/200%, mobile keyboard and packaged desktop visual acceptance.

Verification and scope: `docs/superpowers/plans/2026-10-30-drafts-conflicts-adaptive-toolbar-progress.md`. Git merge UI remains a separate future stage.

### 2026-10-30 — follow-up review

- [x] Исправить подтверждённые проблемы сохранности журнала, scope и запоздалых подтверждений.
- [x] Проверить настоящий browser zoom 100/125/150/200% при трёх ширинах боковой области.
- [x] Проверить геометрию overlay/resizing клавиатуры, панорамирования, меню/палитр и диалога конфликтов.
- [ ] Проверить физическую iOS/Android клавиатуру на устройстве; доступного устройства в этой среде нет.

Отчёт: `docs/superpowers/plans/2026-10-30-drafts-conflicts-adaptive-toolbar-review.md`.

## Remote MCP (2026-10-30)

Implementation and validation ledger: [remote MCP plan](docs/superpowers/plans/2026-10-30-remote-mcp.md). Local stdio compatibility, shared operations, HTTP auth, packaging and docs are tracked there. Public HTTPS deployment and live Perplexity Pro smoke are separate acceptance steps.

## Rendering polygon parity (2026-11-02)

- [x] Import the vault note font size and match property presentation, partial list indentation, task ticks and inline-link geometry.
- [x] Preserve bounded inert HTML formatting; match code fences, display math, Mermaid colors and source-edit actions.
- [x] Keep embedded-note navigation and native missing-reference presentation; resolve same-note heading/block links and compact missing PDF embeds.
- [x] Match consecutive image spacing and use validated YouTube player settings for authored privacy-domain iframes while keeping other frames isolated.
- [x] Verify mouse hover, keyboard activation and unchanged note source against isolated native Obsidian fixtures.

Validation details and explicit browser/native limitations: [polygon parity](docs/superpowers/plans/2026-11-02-render-polygon-parity.md), [marker/media follow-up](docs/superpowers/plans/2026-11-02-marker-media-parity.md). The implementation passed 390 server tests (10 Windows skips), 518 web tests, typecheck, full build, local integration smoke and isolated Linux integration smoke before the PR integration checks. Bases remain outside this parity pass.
