# Changelog

## Native embed compatibility and public readers — 2026-11-01

- Match explorer filtering, filename titles, ordered tasks and native checkbox/strikethrough behavior.
- Add a shared PDF.js viewer with scoped styles, native-like menus, source/file actions, fragment highlighting and responsive embed geometry.
- Unify Wiki/Markdown note, image, media and Canvas embeds; preserve block formatting and reveal note fragments across views, browser reload and history.
- Render independently published nested notes and Canvas file cards with visitor-specific access checks, scoped asset URLs and bounded reads.
- Isolate authored web frames with opaque-origin sandboxing; add synthetic native captures and real browser regressions. Bases remain excluded.

## Canvas group interactions — 2026-11-01

- Keep selected groups behind contained cards so nested text remains editable and linked files remain openable. Add a browser regression for hit testing, editing, unchanged neighboring nodes and file opening.

## Settings button deduplication — 2026-11-01

- Remove the duplicate Settings button beside the vault name; retain the ribbon Settings control on desktop and mobile.

## Code file viewer — 2026-11-01

- Add read-only CodeMirror code views, including split panes, theme-aware highlighting, search, copy and configurable extension mappings.
- Bound preview reads to 10 MiB and reject binary/invalid UTF-8 with a download fallback; preserve local drafts and normal note saving.

## Ordinary URL rendering and clicks — 2026-11-01

- Keep ordinary standalone HTTP(S) addresses as compact text links in Live, Reading and split preview, without fetching metadata or replacing them with rich cards.
- Make inline bare URLs clickable, including the editable form shown when the caret is inside an address. Preserve named Markdown links, literal code and media embeds.

## Formatting toolbar navigation fix — 2026-11-01

- Keep the formatting toolbar and external-change notice keyed independently so opening another article removes the previous toolbar instead of accumulating duplicate rows.
- Add real Workspace navigation regression coverage across Live, Source and Reading modes.

## Saved browser copy cleanup — 2026-11-01

- Automatically remove browser recovery copies whose exact text already exists in the saved file.
- Retain differing/unavailable copies and protect active edits, open comparisons and vault changes; update the recovery count after removal.

## External article change indicator — 2026-11-01

- Notify when an open Markdown article changes outside the browser, with an explicit refresh action.
- Preserve browser edits and open version comparison when both copies changed; ignore own saves and stale replies after navigation or vault changes.
- Recheck on filesystem events, return to the tab, and every 30 seconds while visible.

## Plugin runtime and diagnostics — 2026-10-30

- Load authenticated same-origin CommonJS factories as ESM under the existing CSP,
  replacing browser string evaluation. Validate syntax without server execution.
- Show per-plugin lifecycle/failure state and one summary instead of overlapping
  generic incompatibility notices; dispose resources on disable and vault/logout.
- Protect plugin note writes with content versions and store web plugin data/code
  separately from desktop `.obsidian` files.
- Document the verified API subset and exact real-plugin limitations in
  [PLUGIN_COMPATIBILITY](docs/PLUGIN_COMPATIBILITY.md).

## Cached startup and resilient indexing — 2026-10-30

- Restore a versioned server cache, then verify file metadata in the background;
  SHA-256 hashes avoid reparsing unchanged notes. Markdown remains the source of truth.
- Queue watcher and application changes, periodically reconcile metadata and audit
  content hashes, and preserve the last successful records on filesystem errors.
- Add index status and maintenance endpoints, readiness errors for index consumers,
  settings controls and automatic refresh of active search results/snippets.
- Keep local stdio and remote MCP on the same search index. Document NAS delays,
  cache migration, recovery and a synthetic benchmark in [INDEXING](docs/INDEXING.md).

## Fresh search index on startup — 2026-10-30

- Rebuild search from current vault files before accepting requests, instead of
  trusting an old non-empty snapshot. Notes added or edited while the server was
  stopped now appear in web and MCP search; deleted notes no longer remain in results.
- Added regression coverage for additions, edits, deletions and the refreshed snapshot.

## Remote MCP — 2026-10-30

- Added opt-in stateless Streamable HTTP at `/mcp`, using existing scoped API keys,
  per-request authentication, shared REST rate limits and explicit Host/Origin checks.
- Preserved local stdio commands and all ten tools; REST and MCP share note operations.
- Fixed double decoding of Agent API paths containing literal percent signs.
- Added HTTP/stdio integration checks, Docker runtime CI smoke and a
  [Perplexity Pro setup guide](docs/MCP_REMOTE.md). Live Perplexity/HTTPS acceptance
  remains to be performed on the deployed instance.

## Literal identifiers use body text color — 2026-10-29

- Display `<LS_BEN>` and other underscore identifiers in the normal text color in
  Source/Live/Reading, including their brackets. Preserve note source and actual
  HTML/code syntax colors. This supersedes the earlier decision to retain red.
- Verify mode switching with the actual React Editor: Source exposes Markdown,
  Live renders it, Reading renders it read-only, and document text stays unchanged.
- Match Obsidian Live for paired multiline backticks, including blank paragraphs:
  conceal delimiters and display the body as ordinary literal lines, preserving
  identifiers and line breaks. Reading keeps its separate Markdown semantics.

## 2026-10-29 — Native Editing Toolbar

- Full standard toolbar inventory with popup groups, text tools, insert dialogs, brush/cleanup, alpha colors and alignment; shared editor command registry.
- Selection, fixed and mobile layouts, safe settings/import/export, custom literal templates and clipboard fallbacks.
- Retain finished parallel rendering parity work (tables, embeds, fragments, typography and literal angle-bracket text).


## Rendering parity: background reference checks — 2026-10-29

- Capture Obsidian 1.14.5 reference PNG/DOM/styles in an isolated hidden process,
  preserving OS focus and note hashes. No app installation or production access.
- Render tables inside lists/quotes, preserve their prefixes on edit/Undo and retain
  empty column positions and correctly escaped pipes.
- Resolve compound heading paths within their parent sections and match the observed
  six-level transclusion limit. Align measured text, paragraph, quote and table metrics.

## Rendering parity: original Obsidian comparison — 2026-10-29

- Compare synthetic fixtures with Obsidian 1.14.5 in an isolated vault; record
  accessibility evidence and unchanged source hash (window capture was unavailable).
- Share Markdown preprocessing, callouts, tasks and HTML sanitization between web/public.
  Render formatted table cells, nested/folded callouts and Reading footnotes with working
  links and unique IDs. Keep compiled embeds out of a second Markdown pass.
- Support paragraph/list block embeds and source-relative resolution of same-named notes;
  omit filename titles for fragment embeds and preserve angle-wrapped image destinations.
- Fall back to visible source for YAML the simple property editor cannot preserve.
- Verify 24 mode/theme/width/line-ending combinations without document edit transactions.
  Remaining visual and syntax coverage is documented in `docs/rendering-compatibility.md`.

## Rendering parity: critical parsing fixes — 2026-10-29

- Preserve literal identifiers such as `<LS_BEN>` alongside inline HTML in Live/Reading.
- Protect parser-defined code, escapes and HTML attributes before Markdown extensions;
  restrict Live tables to actual parser boundaries and prevent embed expansion inside code.
- Hide Obsidian comments in Reading/preview/public output, including public metadata,
  while keeping them editable in Live and preserving literal examples inside code.
- Share heading-embed selection between Live and preview, preserve attachment paths and
  carry the embedded note's path when resolving its images. Missing headings keep a fallback.
- Add shared fixtures and browser regressions for source preservation. Full visual parity,
  block embeds, complex table formatting and remaining dialect differences are still pending.

## Editor color and selection toolbar — 2026-10-29

- Add text/background color palettes, custom colors and reset to the desktop/mobile formatting toolbar.
- Show a compact floating toolbar for selected text; preserve selection, support Escape and Undo/Redo,
  inherit the current theme, and disable formatting on locked/read-only notes.
- Store Obsidian-compatible color spans, preserve Markdown block structure and render colors with
  emphasis/inline code in Live/Reading and the Markdown preview. No new dependencies.

## Rendering dependency maintenance — 2026-10-29

- Upgrade KaTeX to patched 0.18.10 and Mermaid to 12.2.0, sharing the patched math renderer.
  Pin KaTeX because 0.18.11 was deprecated by its publisher for accidental breaking changes.
- Reject inherited trust in math options; add security regressions and ordinary rendering controls.
- Gate all npm advisory severities in CI. Mermaid diagrams now need an ES2024-capable browser
  (Safari 17.4+); diagram layout may differ from Mermaid 11.

## Moderate dependency maintenance — 2026-10-29

- Refresh compatible Hono/node-server, fast-uri, ip-address and qs versions; update desktop
  esbuild without forcing Vite's separate compiler version outside its supported range.
- Cover encoded URI schemes, comma-array coercion, IPv6 link-local ranges and compiler CORS.
- Extend dependency and CI audit guards to moderate severity; KaTeX and Mermaid are deferred.

## High dependency maintenance — 2026-10-29

- Update Electron to maintained 43.8.4 in install and packaging pins, retaining Windows ia32;
  remove the vulnerable legacy extract-zip dependency through its supported replacement.
- Upgrade Vite to maintained 6.4.5, MCP SDK to 1.32.2, Multer to 2.5.0 and Zod to 4.6.7;
  refresh both body-parser lines and Browserslist within compatible parent ranges.
- Preserve nested settings defaults with Zod prefaults; cover fresh/legacy values and secrets,
  early collection-size rejection, compressed JSON, malformed/normal uploads and MCP constraints.
- Extend CI dependency guards and audit threshold to reject both high and critical advisories.

## Security dependency maintenance — 2026-10-29

- Upgrade simple-git/argv-parser, Vitest, concurrently/shell-quote and electron-builder/tar;
  refresh compatible DOMPurify and proxy-addr patches. Remove the vulnerable tinypool path.
- Require Node ≥22.12 for supported desktop build tooling; align CI/release runners and use
  reproducible Docker installs from the checked lockfile.
- Cover mapped-proxy trust, VISUAL editor guards, Git clone/sync and isolated Git configuration;
  reject the remediated critical lockfile versions in CI and exercise desktop directory packaging.
- Keep automatic Git merge noninteractive without weakening simple-git's environment guards.

## Community integration — 2026-10-29

- Combine Pham and Lakyle improvements with source histories and attribution preserved.
- Retain locks/PDF/tasks/templates/MCP/CLI alongside sorting/outline/attachments/media features.
- Default trash retention to zero; automatic permanent deletion requires explicit configuration.
- Add cross-feature state regressions and an isolated HTTP integration smoke test.

All notable changes to WebObsidian are documented here. This project tracks its product
design and version history in [PRD.md](PRD.md); the entries below summarize user-facing
changes. The format is loosely based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

## [0.3.0] - 2026-10-16

### Added
- **File explorer quick actions** — hover a folder row for *New note* / *New canvas*, and hover
  any row for *Delete*. Deleting asks for confirmation in an in-app dialog (native browser
  prompts are blocked in embedded browsers) and warns how many items a folder contains. On touch
  devices the buttons appear on the selected row; the delete button is also reachable by keyboard.
- **Double-click to rename** files, folders and canvases in the file explorer.
- **Manual sorting** — a new *Manual* sort mode. Drag to reorder: the top/bottom edge of a row
  inserts before/after it (with an insertion line) and the middle of a folder row moves the item
  into it. The order is saved with your workspace and kept when items are renamed or moved.
- **Trash retention** — items in `.trash` are permanently deleted after a configurable number of
  days (default 30, `0` keeps them forever), counted from when they were moved to the trash.
  *Settings → Vault & Files → Trash retention*.
- **Local attachment folders** — pasted and dropped images are saved in an `attachments/` folder
  next to the note and linked with relative paths. A trash icon on a rendered image removes it
  from the note and permanently deletes the file when nothing else uses it. These folders are
  hidden in the file explorer by default (*Show attachment folders* setting); a folder named
  `attachments` that contains notes is never hidden.
- **Floating document outline** — a margin outline for the current note with the active section
  highlighted as you scroll; hover for the heading list, click a heading to scroll to it with a
  smooth ease-in-out animation.
- **Human-readable note titles** — notes named like `my-first-note` show as "My First Note" in
  the file explorer and the note's title (display only — filenames are unchanged). A front
  matter `title` overrides it in the note view.
- **Reveal active file in explorer** — a setting (*Settings → Vault & Files*) that expands
  parent folders, scrolls to the active file and highlights it when you switch documents.

### Fixed
- Wrapped lines in bullet, task and ordered lists now line up under the text.
- Pasting several images that share a filename (such as `image.png`) no longer overwrites earlier
  ones, and every pasted image gets its link.
- Public share pages show the right image for notes with local attachments, including file names
  with spaces.

## [0.2.0] - 2026-10-15

### Added
- **Inline media embeds** — a YouTube, Instagram or Facebook link alone on a line renders as
  a player in Live and Reading modes and on public share pages. Only whitelisted providers
  embed; the iframe URL is rebuilt from validated IDs and sandboxed.
- **Link preview cards** — a pasted URL alone on a line becomes a rich card (title,
  description, thumbnail, domain). Metadata is fetched server-side with SSRF protection
  (private/loopback addresses blocked, redirects re-validated, size and time capped); links
  that cannot be previewed stay plain. `GET /api/linkpreview`.
- **Multi-cursor editing** — Option/Alt+Click adds a cursor, Shift+Alt+Drag selects a
  column, Esc returns to a single cursor.
- **Hanging indent for lists** — wrapped lines in bullets, tasks and ordered lists align
  under the text instead of the marker (nested lists and multi-digit numbers included).
- **YAML front matter highlighting** in Source mode (new dependency `@codemirror/lang-yaml`).

### Fixed
- Alt+Click no longer collapses multi-cursor selections in Live Preview.

## [0.1.3] and earlier

### Added
- **A status you pick, not a status you type.** On a task page the `status` was free text, so changing
  it meant spelling the id exactly — and a typo is not cosmetic: the board maps only
  `open / in-progress / blocked / done` plus a few aliases, so anything else becomes a column of its
  own and is never rewritten on read. Keys whose values are a closed list — `status`, `priority`,
  `origin`, `confidence`, `severity` — now show a `▾` beside the value that opens the vocabulary the
  vault's `SCHEMA.md` defines (`status` per page kind: a task's statuses are not an abnormality's, and
  a page kind with none — an ADR, an entity — offers no list at all), marks the note's current value,
  and writes the pick back through the
  same frontmatter path as typing (one `status:` line changes; the rest of the note is untouched). The
  field stays editable text, and a value the table does not know (`accepted`, `dropped`) is kept,
  listed first with a label and never rewritten — the vocabulary lives in the vault, the app only
  saves the typing. *(issue #61)*
- **The vault can hand you a file it cannot show.** A Word, Excel or PowerPoint document, an archive
  or an RTF used to fall through to the markdown editor — which rendered its bytes as noise — and the
  only URL that served it (`/api/files/content?path=…`) saved it as `content`, with no extension, so
  nothing on the desktop could open the result. Those types now open a pane with the file name and a
  **Download** button, and the server sends them as an attachment under their real name (including
  non-ASCII names, via RFC 5987 `filename*`). Both halves come from the same seam as the PDF viewer:
  `fileViewKind()` picks the pane, `?download=1` picks the header. *(issue #59)*
- **PDF files open in a viewer — and `![[doc.pdf]]` embeds one inline.** A PDF in the vault used to be
  unviewable: `/note/<path>.pdf`, a click in the file tree and a wikilink all opened an *empty* editor
  tab, because the pane only knew markdown, canvases, images, audio and video. A PDF now opens as a
  full-pane frame served by the browser's own viewer (pages, zoom, search, print), and `![[doc.pdf]]`
  renders that same viewer inline in Live Preview and in the Reading/split preview, with the file name
  as a link that opens it as a tab. Rendering the frame required the app's CSP to allow framing its own
  content (`frame-ancestors 'none'` → `'self'`; third parties stay blocked), and the sanitize schema was
  *not* widened — raw note HTML still cannot inject an iframe. A link to an attachment the vault does
  not hold (`[[report.pdf]]` with a typo) now says "File not found" instead of quietly creating a note
  named `report.pdf`. Other binaries (`.xlsx`, `.docx`, `.zip`) now open a **download** pane instead of the editor — see the
  entry above. *(issue #57)*
- **Vault locks — notes the browser cannot write.** Mark paths in `_system/locks.json` (raw evidence,
  generated boards and indexes, `_system/` itself) and a *session* write is refused with `423 locked`
  while an **API key keeps writing** — the app's two writers were already separate, so a lock is a guard
  on one router rather than a second permission system. Locked notes show a 🔒 in the file tree and open
  read-only with a banner that states the reason; unlocking is deliberate (`confirm` dialog, the operator
  password, or `off` for none). See [docs/LOCKS.md](docs/LOCKS.md).
- **Settings → Appearance → Show inline title.** Turn off the file-name title above each note when your
  notes already open with their own heading (on by default, like Obsidian).
- **`CLIENT_IP_HEADER`** (e.g. `CF-Connecting-IP`): behind a tunnel every visitor shares the proxy's
  address, so ten wrong guesses from anyone locked the owner out of login for 15 minutes. With this set,
  the login limit is per visitor. The header is only trusted from a peer that `TRUST_PROXY` trusts.
- **New note from template — the copy, rename and re-date steps are gone.** A `New note from template`
  command (command palette + a ribbon button) lists the templates in your vault's `templates` folder,
  takes a title, and creates `<folder>/<YYYY-MM-DD>-<slug>.md` with the template's placeholders filled
  in and the note opened for editing. The target folder is derived from the template's name
  (`meeting` → `meetings`, `query` → `queries`, `weekly-review` → `reviews`), is shown before anything
  is written, and stays editable. Placeholders: `{{title}}`, `{{date}}`, `{{time}}`, `{{slug}}` — plus
  the literal `YYYY-MM-DD` / `YYYY-MM-DD-slug` shapes existing templates already use, so no template
  has to be migrated. It never overwrites (a taken name moves to `-2`, `-3`, and the write is
  create-only server-side) and it does not create a missing folder — it names it instead. *(issue #42)*

### Fixed
- **Reading a note that does not exist is a `404`, not a `500`.** `GET /api/files/content` resolved a
  missing path by basename (the `![[image.png]]` embed case) and then read it anyway, so ENOENT surfaced
  as a 500. Found by the new live lock assertion in `deploy/smoke.sh`.
- **"Open today's daily note" writes to the vault's own daily folder** (issue #52). It hard-coded
  `Daily/<iso>.md` at the vault root, so a vault that keeps daily notes deeper — `relats/daily/` here —
  grew a stray file at the root on every press. It now picks the **shallowest** `daily/` folder in the
  tree, falling back to a root `Daily/` only for vaults that have no daily folder at all.
- **The `[[` link suggester no longer renders black-on-dark.** The popup was mounted outside the
  themed wrapper whenever the active theme is one of the four **Catppuccin** themes (the lookup only
  matched `.theme-light, .theme-dark`), where the palette variables don't resolve: titles came out
  black and the popup background transparent. It now mounts through `themedPopupHost()`, so every
  theme gets its own colours. Same fix for the Properties **value dropdown** and plugin **notices**.
  *(issue #49)*
- **Tables no longer break words in half** ("Own|er", "hun|g"). Wide tables scroll sideways in their
  own box instead of being squeezed to the line width, on desktop and phone.
- **Live updates survive disconnects.** The browser reconnects the WebSocket with backoff (and reloads
  the file tree once), the server pings every 30s so proxies like Cloudflare don't drop idle sockets,
  and a plain `GET /ws` answers `426` instead of the app's HTML so a proxy stripping upgrades is obvious.
- **Graph view** fits the whole graph once the layout settles (only zooming out, and not if you already
  moved the camera), hides labels that would overlap (busiest nodes keep theirs), and the footer reads
  "N nodes · M notes".
- **Tasks board** columns flex (240–340px) so four fit a laptop screen; per-column label reads "N hidden".
- **Recent / Bookmarks** show the parent folder when two entries share a file name.
- **Search snippets** drop Markdown syntax (`[[…]]`, `**`, `#`, table pipes) and no longer show a sliver
  of a third line.
- **Login screen** uses the theme this browser last used instead of flashing light.
- **Mobile**: pinch-zoom is no longer blocked; form fields are 16px so iOS doesn't zoom on focus.
- **Faster repeat loads**: hashed `/assets/*` files are cached for a year (`immutable`).
- **The timeline now actually lands on today.** `scrollToToday()` ran on mount while the task list
  was still empty: the placeholder range fit the pane, so `scrollLeft` clamped to 0, and the stale
  offset meant the today line sat off-screen — invisible in both themes. The landing now re-runs when
  the range or zoom changes, observes both the scroll container and the chart content, and yields the
  moment you scroll, drag, tap or zoom yourself. Caught by asserting *visibility* in the headless DOM
  check, not just the line's offset (which was always "correct"). *(issue #35)*

### Fixed
- **The template picker picked on hover, so a click looked dead** — moving the mouse over a template
  selected it (hover set the same state the click set) and the first template was pre-selected for you.
  Choosing is now explicit: rows are buttons (click, or Tab + Enter/Space), hover is cosmetic only,
  nothing is pre-chosen, and the form names the current choice. *(FR-17, issue #46)*
- **A template with no folder could be created at the vault root.** `document`, `procedure`, `query`
  and `shift-handover` resolve to no folder, and Create did not check the folder at all, so the note
  landed in the vault root — exactly what the feature promised to refuse. Create is now blocked until
  the template, the title *and* the folder are present (the reason is shown in place of the path), and
  the store action refuses an empty folder outright. *(FR-17, issue #46)*

### Changed
- **Week zoom now shows at least the next eight weeks, whatever the screen.** Pixels per day is derived
  from the chart's real width (`weekZoomPxPerDay`, clamped 4-20px/day) with 12% of the width left as
  past context, and the timeline always draws 56 days of runway past today even when every task is due
  sooner. Measured: 1440px → 8.0 weeks ahead, 1000px with both sidebars open → 8.0, 390px phone → 8.0
  (it was 10.6 / 4.4 / 2.3 at a fixed 16px/day). Week ticks label as `Sep 14` when there is room and as
  `14` when dense, `Month` zoom moved to 3px/day so the zoom order still holds, the title column goes
  compact from the *pane* width rather than the viewport, and the toolbar reports "8.0 weeks ahead".
  *(issue #37)*

- **Tasks timeline restyled.** Two-tier axis (month band above week ticks) with labels like `Sep 28`
  instead of `09-28`; weekend shading; a layered grid (day hairlines, week lines, 2px month lines)
  replacing the per-day gradient haze; a today band, line and `Today` pill; rounded bars with priority
  chips and their title inside when there is room; open-ended bars fading out instead of a dashed
  edge; overdue marked by a red ring *and* stripes rather than colour alone; status named in words in
  the title column. The title column drops from 200px to 132px below 640px and hides the owner and
  priority from its metadata. Every bar-text pair measures ≥4.5:1 in both themes (worst 4.70:1) and
  the `open` bar is lifted on dark themes. *(issue #35)*

### Added
- **Set a due date from the board or the timeline.** The due badge on a card is a control now: click it
  and it turns into a date field (Enter saves, Escape cancels, the `Clear` button writes `due: none`),
  and the `⋯` menu gains "Set due date…" / "Clear due date" for keyboard use. The timeline's row chip
  does the same; clicking a *bar* still opens the note. Writes go through a pure `setTaskDue` that
  changes only the `due:` and `updated:` lines, compare-and-set guarded, with optimistic rollback and
  a notice on failure — the same discipline as the status drag. A **"Needs a due date"** chip filters
  to undated tasks so a batch can be scheduled in one pass. *(PRD 1.14 - FR-15, issue #41)*
- **The task template now carries a due date.** `Wiki/templates/task.md` ships `due: YYYY-MM-DD`
  instead of `due: none`, with the rule stated in the body; `Wiki/SCHEMA.md` makes `due` required on
  task pages and `none` a deliberate exception, so a missing date is a visible decision rather than a
  silently empty field. The action-item extraction skills keep "never invent a date" and now require
  `due: none` to be recorded so those tasks surface under *Needs a due date*. *(issue #41)*

- **Tasks view: filter by status, with Done hidden by default.** A "Status" row of chips (canonical
  four in column order, then any unmapped statuses present), each with its card count; `done` starts
  hidden, everything else — including unmapped values — stays visible. The row reports what it is
  hiding (`1 hidden — show all`, one click to clear) and the task count reflects what is shown.
  **Every column still renders**, including a filtered-out Done: it stays a drop target so a card can
  still be dragged to completion, with `+N hidden` in its header and the reason in its body. The
  timeline shares the same filter. *(PRD 1.13 - FR-15, issue #39)*

- **Tasks timeline (Gantt)** — second mode of the Tasks view (`/tasks?mode=timeline`, command
  palette "Open tasks timeline"): one bar per `type: task` note from `raised` (fallback `created`)
  to `due`; a task with no usable due date is dashed and open-ended, running to today. Day/week/
  month zoom, a fitted range padded by three days, a today line, status-coloured bars (unmapped
  statuses get their own colour) with priority badges, red outline when overdue, sticky title
  column and horizontal panning (touch included). Click a bar or its row label to open the note.
  Geometry is pure UTC-day arithmetic in `web/src/lib/gantt.ts`; no new runtime dependency, no
  server change. Deliberately no dependencies, auto-scheduling, critical path or drag-to-
  reschedule. *(PRD 1.10 - FR-16, issue #32)*
- **The Tasks mode is part of the URL again**: `tasksMode` lives in the store (not persisted) and
  `pathToUrl`/`modeFromUrl` carry it, fixing a reload of `/tasks?mode=timeline` being rewritten to
  the bare `/tasks` and silently falling back to the board. *(issue #32)*
- **Tasks view — Kanban board over `type: task` notes** (`/tasks`, `TASKS_PATH = 'tasks://view'`,
  ribbon entry, command palette "Open tasks board"): four canonical columns (`open` → Backlog,
  `in-progress` → Doing, `blocked` → Blocked, `done` → Done, plus aliases like `todo`/`wip`/`waiting`);
  an unrecognised `status` value gets its own column, a missing one lands in Backlog with a "no status
  field" marker. Drag a card (or use the "⋯" context menu) to change its column — this rewrites only
  the `status:` and `updated:` frontmatter lines through the existing file write path, with an
  optimistic-UI rollback and error notice on failure. Filter bar (folder scope, priority, owner,
  free-text) with manual refresh and vault-watcher auto-refresh. New endpoints `GET /api/tasks` and
  `GET /api/v1/tasks` (Agent API, `read` scope) return the normalised task records, backed by the
  existing search index (no extra vault walk). *(PRD 1.9 - FR-15, issue #31)*
- `GET`/`PUT /api/files/content` gain an optional compare-and-set pair (`version` on read,
  `baseVersion` on write) so a stale write — or one aimed at a note deleted/renamed meanwhile — is
  rejected with `409 version_conflict` instead of clobbering (or resurrecting) it; omitting
  `baseVersion` keeps the previous (unconditional) write behaviour. *(PRD 1.9 - FR-15)*

### Dark themes — visible caret, and CodeMirror's Find panel follows the theme

- **The caret is no longer black on a dark theme.** `drawSelection()` hides the native caret
  (`caret-color: transparent !important`) and paints its own `.cm-cursor` element, whose border
  CodeMirror hard-codes to `black` — its `&dark` variant only applies when the `darkTheme` facet is
  on, and this app themes through CSS variables instead, so the facet never is. The drawn caret
  (and the drop cursor) now takes `var(--text-normal)`; verified in a real browser as
  `#dadada` on Obsidian Dark (was `#000` on `#1e1e1e`), `#222222` on light, `#cdd6f4` on Catppuccin
  Mocha — and confirmed on a screenshot.
- **The Find & Replace panel (`Ctrl+F`) is dark on dark themes.** Same root cause: its background is
  CodeMirror's hard-coded light `#f5f5f5` (with browser-default white inputs). The panel, its text
  fields and buttons are now themed from the palette on every theme.
- Guard: `web/tests/editorTheme.test.ts` fails CI if these CodeMirror defaults are left at a literal
  colour instead of a palette variable (it goes red if the caret rule is reverted to `black`).

### Live Preview — clicking a row no longer edits the row below it

- **The caret now lands on the row you click.** CodeMirror builds its height map from border-box
  rects and assumes blocks stack directly on top of each other, so vertical `margin`s between
  blocks were invisible to it: the map ran short (a title + properties block + table made it 76px
  short) and every click below a gap resolved one or two lines further down. Spacing for the note
  title, properties block, table, the `` ```html `` render toggle, raw-HTML block and mermaid
diagram is now
  padding on the measured block, and the interactive table is `display: block; width: fit-content`
  instead of `inline-block` (an inline-block's anonymous line box added ~7px the map could not see).
  Every editor block is pixel-identical; the space the table's inline-block strut emitted is gone
  (7px tighter below tables).
- **Attachments that arrive after layout no longer desync the map.** An image (or an iframe) that
  loads after CodeMirror measured the line left the map short by the image's height until the next
  scroll or keystroke, which moved every click below it — `mediaLoadRemeasure` re-measures on
  `load`/`error`.
- **A line whose only content is a widget (an image row, say) now takes the caret too.** The
  browser's own contenteditable caret placement picked a *neighbouring* line for clicks in the blank
  part of such a row (the app's first-click fix could not stick against it). The caret is re-asserted
  once the native handling has run, and the clicked row becomes active — so clicking an image row
  behaves exactly like arriving on it with the keyboard (its embed source is revealed). Widgets that
  own their interaction (tables, properties, media players, note transclusions) and drag-select are
  untouched.
- Guards so it cannot come back: `web/tests/editorSpacing.test.ts` (CI) fails on a vertical margin
  on an editor block, and a dev-only `livePreviewGeometryGuard` warns in the console when the height
  map is shorter than the rendered content. README › *Live Preview geometry* explains the rule.
- Verified in a real browser (headless Chromium, local dev instance): 60/60 clicks across
  widget-heavy, heading-heavy and wrapped-text notes put the caret on the clicked line (before the
  fix: 17 of 22 clicks landed a line low), and every isolation note reports map height == rendered
  height.

### Docs — the vault must never be git-synced to this repository

- Added the warning to `docs/DEPLOYMENT.md` (with the recovery procedure and one-line checks) and a
  pointer in the README: pointing the app's **GitHub Sync** at this source repository pulls the whole
  source tree into the vault, where it is served as notes. Use a dedicated notes-only repo for vault
  versioning, and never store a push token for a repo your notes must not reach.

### Graph view paints correct theme colours (fixes dark-mode labels)

- **Labels are no longer black in dark themes.** The canvas read its palette once at mount, so
  text kept the light-theme ink when the graph tab was restored before the saved theme applied, or
  when the theme was toggled with the graph open. Now the graph subscribes to the active theme and
  repaints labels, node tints and edges on every change.
- **Theme-colour resolution is done properly.** The graph reads palette variables through a
  `resolveThemeColor` helper that follows `var()` alias chains and round-trips values through the
  browser, so `hsl(...)`/`calc()` accents (Catppuccin) that Pixi's parser rejected now resolve
  instead of silently using a hardcoded fallback. (Before, accent/accent-hover were always the
  fallback colours — imperceptible on the Obsidian themes, wrong on Catppuccin.)
- **Catppuccin themes are now found.** The themed root was looked up by `.theme-light, .theme-dark`,
  missing the four `theme-ctp-*` classes and falling through to `body`, which cannot see the palette
  vars — every colour became its fallback. The lookup now uses all theme classes (from `lib/theme.ts`).
- Graph "Copy screenshot" now fills its background with the resolved theme `--bg-primary`, so a
  dark-theme screenshot is no longer pasted on white.
- The existing `window.__graphCam` debug hook got the resolved palette + live label fill, so an
  automated UI check can assert ink-vs-background; new unit tests cover the colour resolver
  (`web/tests/cssColor.test.ts`), and root `npm test` now runs every web test file (was only one).

### Agent API — safe read-modify-write, and an MCP server (adopted from other forks)

- **Every read returns a `version`** (sha256 of the content — mtime-independent, so git autosync
  cannot fake a conflict) and **writes can carry `base_version`**: the write applies only if the note
  still has that version, otherwise `409 version_conflict` comes back with `currentVersion` to re-read.
  `""` means "must not exist yet". Omitting it keeps the old last-writer-wins behaviour; set
  `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1` to refuse unversioned writes (`400 missing_base_version`).
- **`PATCH {"find": …, "replace": …}`** edits a literal string in place, server-side, so a stale copy
  can never be written back. Matching is literal (no regex, no `$&` expansion); a `find` that occurs
  more than once is refused with `409 find_ambiguous` + the occurrence count unless `replaceAll: true`.
- **`GET /note-matches?path=&q=`** greps one note: every literal occurrence with its 1-based line
  number, optional `context` lines, `case_sensitive`, `limit`.
- **Segmented reads** — `GET /notes/{path}?offset=&limit=` are line numbers; the response adds
  `version`, `totalLines`, `hasMore`. Omitting `limit` still returns the whole note (no silent
  truncation for existing clients). **`GET /notes?sort=&order=&folder=`** orders the listing
  (default: most recently modified first).
- **`mcp-server/`** — new workspace: a stdio MCP server that wraps the Agent API, so MCP hosts
  (Claude Code, Codex, …) get the vault as 10 tools, with `base_version` plumbed through.
- Source: forks `blueberry6401/webobsidian` and `Absenthome/webobsidian` — re-implemented against
  this tree, credited in the code and in docs/UPSTREAM_PR_MERGES.md → "Adopted from other forks".
- Coverage: 20 new unit tests (find/replace literals, grep line numbers, version tokens), plus smoke
  scenarios D–F (agent API end-to-end, strict mode, a real MCP handshake over stdio).

### Docs — README now documents this fork's setup

- New README section **§ This fork**: what the fork contains, where it runs, the deploy-on-merge
  pipeline, **how to verify which build is live** (`GET /healthz` → `version` + `build`, image-id
  comparison, the `Deploy (LXC 107)` run log) and the **upgrade notes** that matter when coming from
  upstream `v0.1.1` (default password refused once a credential exists, `/auth/status` shape, the
  `127.0.0.1` healthcheck replacing any local override, the build-arg identity, the new `packages/webo`
  workspace, symlink behaviour).
- Quick start clones *this* fork, checks `/healthz` and says why no healthcheck override is needed;
  the shell-script table gained `npm test`, the `webo` CLI and `scripts/smoke-test.sh`.
- Security notes and Contributing updated (default-password rule, `/auth/status`, `docs/agents/`,
  "merging to `main` deploys itself — branch + PR, keep the smoke test green").
- `desktop/README.md`: fork note that the auto-login secret means `123456` is never valid on the
  desktop's loopback server, and that the bundled server carries the merged fixes.
- `docs/DEPLOYMENT.md`: where the app test pages live (vault `Testing/`) and a pointer to the README.

### Build identity in `/healthz` — "which version is running?"

- `GET /healthz` now returns `{"ok":true,"version":"<repo version>","build":"<git commit>"}`; the
  commit is baked into the image by the deploy pipeline (`--build-arg GIT_SHA=…`, surfaced as
  `WEBOBSIDIAN_BUILD_SHA`), so the running version is one curl away — locally, from the host, or over
  the public URL. `build: dev` means the image was built outside `deploy/deploy.sh`.
- `deploy/deploy.sh` passes that build arg, and its smoke test now **asserts the running `build`
  equals the deployed commit**.
- **Fixed:** a deploy could rebuild the image while the old container kept running — `docker compose up
  -d` does not always recreate when only the image content changed, and the smoke test cannot tell
  because the previous container answers the same endpoints. `ensure_running_image` compares the
  container's image id with the freshly built one, forces a recreate on mismatch, and fails the deploy
  if the container still is not running the new build.

### Deploy pipeline (LXC 107) — deploy-on-merge CI/CD

- `deploy/deploy.sh`: idempotent deploy (sync → rolling backup → keep the previous image as
  `webobsidian:rollback` → build → `up -d` → wait for healthy → smoke) with automatic rollback when
  the build or the smoke test fails; `--bootstrap`, `--rollback`, `--backup-only` modes.
- `deploy/smoke.sh`: asserts a *running* deployment (`/healthz`, the SPA bundle, `/auth/status`
  exposing only `passwordSet`, `123456` refused once a credential is configured, the operator password
  logging in) — never prints a secret.
- `.github/workflows/deploy.yml`: deploys after **CI succeeds for a push to `main`** (plus manual
  dispatch) on a self-hosted runner inside the target LXC, which is behind NAT. `workflow_run.event ==
  'push'` is checked so a fork PR can never reach the deploy runner; `concurrency` prevents overlapping
  deploys.
- `docs/DEPLOYMENT.md`: host layout, deploy path, runbook, backup/rollback, one-time runner setup.

### Fixed

- Healthcheck probed `localhost`, which resolves to `::1` inside the image while the server binds IPv4
  only — the container reported `unhealthy` forever while serving normally. Now `127.0.0.1` in both
  `docker-compose.yml` and `Dockerfile`.

### Fork integration — every open upstream PR merged

This tree is the `phamtruonghung/webobsidian` fork with all 17 open pull requests from
`xnohat/webobsidian` merged on top of `v0.1.1` (see
[docs/UPSTREAM_PR_MERGES.md](docs/UPSTREAM_PR_MERGES.md) for the table, the conflict decisions and
the bug fixes made while merging):

- **Security**: the well-known default password `123456` is refused as soon as any credential
  (`userPasswordHash`, `auth.passwordHash`, `WEBOBSIDIAN_PASSWORD`) is configured, and
  `GET /auth/status` no longer leaks `mustChangePassword` to unauthenticated callers (PRs #4 + #15);
  `PUT /api/settings` authorizes `vault.path` against operator-configured roots, not the request body
  (PR #2, with the test suite from #6/#7); shared canvases drop unsafe URL schemes (PR #3).
- **Vault**: symlinks inside the vault are listed/read/written when their target is an allowed root,
  with a realpath cycle guard (PR #23).
- **Editor & UI**: reusable preview tabs (PR #29); graph mobile touch, node dragging and ghost-node
  fix (PR #25); Catppuccin themes (PR #11); dark-mode text contrast (PR #10); Account settings tab
  and code comments in English (PRs #8/#9); percent-encoded image targets and table-cell italics
  (PRs #13/#14).
- **Tooling**: `webo` CLI process manager + graceful SIGTERM/SIGINT shutdown (PR #27); server test
  suite (vitest) and web store tests (`node --test`); dependency refresh to 0 production advisories
  (PR #24).

### Added
- **`webo` Process Manager CLI** (`packages/webo`): command-line utility to manage WebObsidian as a background daemon process (`webo install`, `webo start`, `webo stop`, `webo status`, `webo logs`, `webo restart`, `webo config`, `webo uninstall`). Configured centrally via `~/.webobsidian/.env`. *(PRD 1.6 - FR-14)*
- Server graceful shutdown handlers for SIGTERM/SIGINT signals (cleans up HTTP server, WebSockets, file watcher, and autosync timers).
- Open-source repository scaffolding: `README.md` (with logo), `LICENSE` (MIT),
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, GitHub issue/PR templates and a
  CI workflow (typecheck, build, Docker image).
- File tree **Copy / Cut / Paste** for files and folders (session-local clipboard;
  `POST /api/files/copy` for recursive copy). *(PRD 0.9)*

### Changed
- ⋯ **More options** menu rebuilt for parity with Obsidian Desktop: backlinks-in-document,
  open linked view, open in new window, add file property, in-note Find, export to PDF,
  reveal file in navigation, and per-file version history. *(PRD 0.8)*

## Highlights by PRD revision

- **0.9** — File tree Copy/Cut/Paste; recursive copy endpoint.
- **0.8** — ⋯ menu parity with Obsidian Desktop; per-file Git version history (FR-4).
- **0.7** — Per-note **Share dialog** (create/copy/toggle/password/delete) + globe badge.
- **0.6** — Deploy hardening for self-hosting: all deploy params via `.env`, watcher polling
  fallback on inotify limits, longer healthcheck `start_period` (FR-9).
- **0.5** — Graph node search with smooth fly-to and highlighting (FR-2).
- **0.4** — Mobile / responsive UI: drawer sidebars, edge-swipe, on-keyboard formatting
  toolbar, touch targets, safe-area insets (FR-11).
- **0.3** — Per-pane ⋯ menu (split, bookmark, rename/move, etc.) and a redesigned right
  sidebar tab strip (Backlinks incl. unlinked mentions · Outgoing links · Tags · Outline).
- **0.2** — Deep-link URLs (`/note/...`), public read-only share links with central
  management, server-side rendering for SEO (FR-10).

## Core (v1 baseline)

- Obsidian-compatible vault (works on existing `.obsidian/` vaults).
- CodeMirror 6 editor with live/source/reading views; wikilinks, embeds, tags, callouts,
  tasks, KaTeX, Mermaid; backlinks, outline, graph view.
- QMD full-text + fielded search (MiniSearch), incremental indexing, disk persistence.
- GitHub sync (pull/commit/push) with Git LFS.
- Single master password login (scrypt + JWT cookie).
- Scoped Agent API at `/api/v1` with hashed API keys and rate limiting.
- Community-plugin loader against an Obsidian-API shim (subset).
- Pure-JSON config (`data/settings.json`); one-command Docker stack.

---

> Note: WebObsidian is pre-1.0 and has not cut tagged releases yet. Once releases begin,
> each version will get its own dated section here.
