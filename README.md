<div align="center">

<img src="assets/logo.png" alt="WebObsidian logo" width="140" />

# WebObsidian

> **Community contributions integrated into WebObsidian.** Improvements from the
> `phamtruonghung`, `lakylekidd` and `macros0` forks retain contributor attribution.

**A self-hosted, Obsidian-compatible web app for your Markdown "second brain".**

Point it at a folder of Markdown files and edit your notes from any browser — with a
CodeMirror editor, live preview, wikilinks, an interactive graph, full-text search,
GitHub sync (incl. Git LFS), an API for AI agents, and community-plugin support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/xnohat/webobsidian/actions/workflows/ci.yml/badge.svg)](https://github.com/xnohat/webobsidian/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)

[Quick start](#-quick-start-docker) · [Community integration](#-community-integration) · [Features](#-features) · [Configuration](#-configuration) · [Agent API](#-agent-api) · [Development](#-local-development) · [Architecture](#-architecture)

> 📐 Design: [PRD.md](PRD.md) · 📋 Progress: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

> 🔀 **Community contributions to `xnohat/webobsidian`.** It combines the `phamtruonghung`
> and `lakylekidd` forks with contributor attribution. See
> [integration provenance and verification](docs/FORK_INTEGRATION.md).

</div>

---

## What is this?

WebObsidian is a web application that gives you an [Obsidian](https://obsidian.md)-like
experience over a **real folder of Markdown files** living on your server. Your vault is
100% compatible with an existing Obsidian vault (including the `.obsidian/` folder) — you
can edit the same files from the Obsidian desktop app and from the web, side by side.

If the desktop app shows stale notes or deleted files until restart when sharing
a Synology/SMB vault, see [Obsidian network-vault refresh and SMB Vault Watcher](docs/OBSIDIAN_NETWORK_VAULTS.md).

It is **single-user** and self-hosted: one master password protects the whole app, all
configuration lives in a plain `data/settings.json` (no database engine), and the entire
stack runs from a single `docker compose up`.

### Interface language

Open **Settings → Language** to import a UTF-8 `.txt` language file or download a
blank template. The selected translation is saved on the server and shared by
your browsers. Missing translations use the app's English text.

An independently authored Russian translation is available for manual import.
[Download the Russian language file](translations/ru.txt).

> **Why?** To access and edit your knowledge base from any browser, on any device, while
> keeping full ownership of your files — and to let AI agents read/write your vault through
> a safe, scoped REST API.

---

## 🔀 Community integration

This contribution was assembled in `macros0/webobsidian` from these community forks:

- [phamtruonghung/webobsidian](https://github.com/phamtruonghung/webobsidian): auth/path safeguards,
  PDF and binary downloads, vault locks, tasks/timeline, templates, preview tabs, CLI and MCP.
- [lakylekidd/webobsidian](https://github.com/lakylekidd/webobsidian): manual file sorting,
  explorer shortcuts, document outline, editing improvements, local attachment folders,
  rich links, media embeds and configurable trash retention.

**Automatic trash cleanup defaults to disabled (`trashRetentionDays: 0`).** Explicit existing
retention settings are preserved. Enable a positive number only when permanent deletion is wanted.

Exact source commits, conflict resolutions and checks: [docs/FORK_INTEGRATION.md](docs/FORK_INTEGRATION.md).
Older documents about LXC 107 describe the Pham source fork. This repository has no deployment
connection to that machine; its inherited deployment workflow is guarded to the source repository.
No existing installation is upgraded automatically by this integration.

### Which build is running?

```bash
curl -s http://localhost:8787/healthz      # or the public URL
# {"ok":true,"version":"0.1.1","build":"71fbbc2"}
```

`build` is the git commit the image was built from (`dev` = image built outside `deploy/deploy.sh`).
Compare it with the branch tip, and check that the container runs the image you just built:

```bash
gh api repos/xnohat/webobsidian/commits/main --jq '.sha[0:8]'
docker inspect <container> --format '{{.Image}}'
docker image inspect webobsidian:latest --format '{{.Id}}'   # the two must match
gh run list --repo xnohat/webobsidian --workflow CI --limit 3
```

### Upgrade notes — coming from upstream `v0.1.1`

- **The default password `123456` stops working as soon as any credential is configured** — a UI
  password, `WEBOBSIDIAN_PASSWORD`, or `auth.passwordHash` in `settings.json`. It is refused both at
  login *and* as the "current password" in change-password, because that is exactly the state where
  the forced-change screen disappears. A fresh install is unchanged: `123456` works and must be
  changed.
- **`GET /auth/status` no longer returns `mustChangePassword`** — it was an unauthenticated oracle for
  "this instance still accepts the default". Clients read the flag from `/auth/login` and `/auth/me`.
- **The healthcheck probes `127.0.0.1`, not `localhost`.** Inside the image `localhost` resolves to
  `::1` while the server binds IPv4 only and busybox `wget` does not fall back, so the old probe
  failed on every interval and the container reported `unhealthy` while serving every request. If you
  added a `docker-compose.override.yml` to work around that, delete it — the fix is in
  `docker-compose.yml` and `Dockerfile` (also offered upstream as
  [xnohat/webobsidian#30](https://github.com/xnohat/webobsidian/pull/30)).
- **Builds are identified.** `docker compose build --build-arg GIT_SHA=<sha>` bakes the commit into
  the image (`deploy/deploy.sh` passes it), and a deploy fails if the running container is not the
  image it just built.
- **New workspace `packages/webo`** — run `npm install` after pulling (or `docker compose up -d
  --build`). Root `npm test` now runs the server suite (vitest) *and* the web suite, and root
  `npm run typecheck` covers `packages/webo` too.
- **Symlinks inside the vault are followed** when their target is inside `ALLOWED_ROOTS` (realpath
  cycle guard); targets outside those roots are still refused.
- User-facing: reusable preview tabs, Catppuccin themes, graph touch/drag, English Account tab and
  comments, dark-mode text contrast, images whose name contains a space, and `DB_NAME_v2`-style table
  cells no longer rendering as italics.

### Data safety and CLI upgrade notes

Review fixes: closing a dirty tab waits for its latest save; save failures keep the
tab and edits available. Rename/move refuses occupied destinations with
`409 destination_exists`. Recursive copies validate nested link targets and publish
only complete copies. Temporary copies are excluded from watcher indexes and application
Git snapshots. Text writes use exclusive unique temporary files.

The CLI no longer installs `123456` as a permanent recovery override. Existing
`WEBOBSIDIAN_PASSWORD=123456` values are treated as no override, so the normal
first-run password change applies; a previously chosen password remains effective.
Strong recovery overrides and Electron's generated secret continue to work.

Browser and Agent API read/check/write operations share a transaction queue in one
server process. Independent Obsidian, Git or other filesystem writers do not join
that queue; concurrent multi-process access is not a transactional storage system.

### Never sync the vault to this repository

The app's **Settings → GitHub Sync** must not be pointed at this source repository: it pulls the
source tree (`CHANGELOG.md`, `IMPLEMENTATION_PLAN.md`, `server/`, `web/`, `.git`, …) into the vault,
where the app then serves those files as notes. Use a dedicated notes-only repo for vault
versioning — details and the recovery steps are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#-vault-git-sync--never-point-it-at-this-repository).

### Keeping up with upstream

```bash
scripts/upstream-pr-status.sh              # every open upstream PR: merged here, or new?
scripts/upstream-pr-status.sh --new-only   # just the new ones (exit 1 when any exist)
scripts/merge-upstream-pr.sh <n>           # fetch refs/pull/<n>/head and merge with provenance
```

`.github/workflows/upstream-sync.yml` runs that check weekly and files an issue labelled
`upstream-sync` only when a genuinely new third-party PR exists.

---

## ✨ Features

- 🔒 **Vault locks** — mark paths read-only for the browser (`_system/locks.json`): raw evidence,
  generated boards and indexes refuse session writes with `423 locked` while the agent keeps
  writing. Locked notes show a 🔒 in the tree and a banner in the editor explaining why.
  See [`docs/LOCKS.md`](docs/LOCKS.md).

- 📝 **Editor & rendering** — CodeMirror 6 with live / source / reading views; wikilinks
  `[[note]]`, embeds `![[file]]`, tags `#tag`, callouts, task lists, KaTeX math and
  Mermaid diagrams. Diagrams require an ES2024-capable browser (Safari 17.4+).
- 📕 **PDF viewer** — open a PDF from the tree or a `/note/<path>.pdf` link and it renders in the
  pane (the browser's own viewer: pages, zoom, search, print); `![[doc.pdf]]` embeds that viewer
  inline in a note.
- 📥 **Download the vault's binaries** — a Word/Excel/PowerPoint file, an archive, an RTF: types with
  no in-app viewer open a pane with a **Download** button and save under their own name (extension
  included), instead of landing in the editor as binary noise or saving as `content`.
- 🏷️ **Pick a status instead of typing one** — keys whose values are a closed list (`status`, `priority`,
  `origin`, `confidence`, `severity`) show a `▾` beside the value that opens the vocabulary on the note
  itself, with the note's own value marked. `status` follows the page kind (a task's list is not an
  abnormality's; a kind with no list — an ADR, an entity — gets no `▾`). The board maps only
  `open / in-progress / blocked / done` (plus aliases like `wip`, `waiting`); any other status gets a
  column of its own, so the picker offers the ids in use. The field stays editable text, and a value the
  app does not know (`accepted`, `dropped`) is kept, shown first and never rewritten.
- 🕸️ **Graph view** — force-directed graph built from your wikilinks, with fly-to node
  search and highlighting.
- 📄 **New note from template** — pick a template from your vault's `templates` folder and it is
  created as `<folder>/<YYYY-MM-DD>-<slug>.md` with its placeholders filled and opened for you:
  no manual copy, rename or re-dating (command palette → *New note from template*)
- 🗂️ **Tasks board** — Kanban view over `type: task` notes (`/tasks`); drag a card to change its
  `status:` frontmatter, filter by folder/priority/owner/title, `GET /api/tasks` (and
  `/api/v1/tasks` for agents).
- 📅 **Tasks timeline** — Gantt view of the same notes (`/tasks?mode=timeline`): a bar per task from
  `raised` to `due` (dashed and open-ended when there is no due date), day/week/month zoom, a today
  line, overdue highlighting. Bars only — no dependencies or auto-scheduling.
- 🔗 **Backlinks & outline** — right sidebar tab strip: Backlinks (linked **and** unlinked
  mentions), Outgoing links (resolved/unresolved), Tags and Outline.
- 🔍 **QMD search** — fast full-text + fielded search (`tag:`, `path:`, `title:`), fuzzy +
  prefix matching and incremental indexing. A saved cache enables startup while background reconciliation checks offline changes. A shared queue, file hashes and periodic audits recover missed changes. For NFS/SMB vaults, set `WEBOBSIDIAN_WATCH=polling`. See [indexing, freshness and recovery](docs/INDEXING.md).
- 🔄 **GitHub sync** — native `git` pull / commit / push with **Git LFS** for large
  attachments, optional auto-sync, and per-file **version history** (browse & restore).
- 🔐 **Login gate** — a single master password (scrypt-hashed) protects everything; JWT in
  an httpOnly cookie.
- 🌐 **Public sharing** — turn any note into a read-only, server-rendered (SEO-friendly)
  public page at `/share/<token>`, optionally password-protected.
- 🤖 **Agent API** — scoped API keys (`read` / `write` / `search`) let AI agents work with
  the vault over REST at `/api/v1`. Every read returns a content `version`, writes can carry
  `base_version` (compare-and-set, no clobbering), `PATCH` edits in place with literal
  find/replace and `/note-matches` greps a note with line numbers. Bundled **MCP server** for
  MCP hosts. See [docs/AGENT_API.md](docs/AGENT_API.md).
- 🧩 **Community plugins** — install Obsidian plugins from GitHub; loaded against an
  Obsidian-API compatibility shim (subset support). See [plugin compatibility and diagnostics](docs/PLUGIN_COMPATIBILITY.md).
- 📱 **Responsive / mobile** — drawer sidebars, edge-swipe, an on-keyboard formatting
  toolbar, and touch-friendly targets, à la Obsidian Mobile.
- 🗃️ **Pure-JSON config** — everything lives in `data/settings.json`. No database.
- 🐳 **Docker** — one command to run the whole stack.

---

## 🚀 Quick start (Docker)

```bash
git clone https://github.com/xnohat/webobsidian.git
cd webobsidian
cp .env.example .env          # edit VAULT_HOST_PATH, set WEBOBSIDIAN_PASSWORD
docker compose up -d --build
curl -s http://localhost:8787/healthz   # {"ok":true,"version":"0.1.1","build":"dev"} — "dev" = built here
# open http://localhost:8787
```

Out of the box it serves the bundled `./sample-vault`, so the stack boots immediately. All
deployment settings live in **`.env`** (git-ignored) — you never edit the tracked
`docker-compose.yml`, so a `git pull` / redeploy keeps your config and vault mapping intact.

No healthcheck override is needed: the probe targets `127.0.0.1` (earlier versions probed
`localhost`, which resolves to `::1` inside the image while the server binds IPv4 only, so the
container reported `unhealthy` forever). `build` in `/healthz` tells you which commit you are
running; `docker compose build --build-arg GIT_SHA=$(git rev-parse --short HEAD)` bakes it in.

## 🖥️ Desktop app (no server setup)

Prefer a native app? Grab an installer from the
[**Releases**](https://github.com/xnohat/webobsidian/releases) page — available for
**macOS / Windows / Linux** (arm64 · x64 · ia32). Build an installer locally with
`npm run desktop:dist`:

| Platform | Download |
|----------|----------|
| macOS    | `.dmg` (or `.zip`) — arm64 / x64 |
| Windows  | NSIS installer `.exe` or portable `.exe` — x64 / arm64 / ia32 |
| Linux    | `.AppImage` or `.deb` — x64 / arm64 |

The desktop app bundles the whole server, picks your vault folder on first launch, and
**logs you in automatically** — no password to type, no Docker. Apps are currently
**unsigned**, so macOS Gatekeeper / Windows SmartScreen will warn on first open (right-click →
Open on macOS). Build it yourself with `npm run desktop:dist`; see
[`desktop/README.md`](desktop/README.md) for details.

## 🛠️ Process Manager CLI (`webo`)

Want to manage WebObsidian without Docker as a lightweight background daemon? Install the `webo` command line tool:

```bash
npm run build
npm run webo install    # symlinks 'webo' executable to PATH and scaffolds ~/.webobsidian/.env
```

Now you can control the WebObsidian background service directly from anywhere:

```bash
webo start             # Start WebObsidian as a background daemon
webo status            # Check process PID, port, and health check (/healthz)
webo logs -f           # Tail server logs (~/.webobsidian/webo.log)
webo restart           # Restart the daemon
webo stop              # Gracefully stop the server daemon
webo config            # Inspect active environment config (~/.webobsidian/.env)
webo uninstall         # Remove 'webo' symlink from PATH
```

---

### Point it at your own vault

```bash
# .env
VAULT_HOST_PATH=/abs/path/to/your/ObsidianVault   # must exist; bind-mounted to /vault
WEBOBSIDIAN_PASSWORD=use-a-strong-password
HTTP_BIND=0.0.0.0                                  # 127.0.0.1 to expose only to localhost
HTTP_PORT=8787
```

Then `docker compose up -d --build`. Your vault can be a plain folder or a `git clone`
(Git LFS is supported for attachments).

### Behind a reverse proxy (TLS)

Set `HTTP_BIND=127.0.0.1` so the app is only reachable from the host, then terminate TLS
with nginx / Caddy / Traefik in front of `http://127.0.0.1:8787`.

### Large vaults & file watching

A fresh VPS ships a low `fs.inotify.max_user_watches` (often 8192), which a big vault
exceeds. WebObsidian auto-detects this and falls back to **polling** (works anywhere,
higher CPU). For lower CPU, raise the kernel limit and keep native watching:

```bash
sudo sysctl -w fs.inotify.max_user_watches=524288
echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
```

The search index (QMD) and link graph are kept in memory, so memory use scales with the
number of notes. The Docker image sets `NODE_OPTIONS=--max-old-space-size=4096` (4 GB);
raise it to `8192` for very large vaults (e.g. 6k+ notes / multi-GB).

---

## 💻 Local development

Requires **Node ≥ 22.12** and `git` (+ `git-lfs` if you use LFS). The desktop build tooling
requires this baseline; Docker already uses Node 22.

```bash
npm install
npm run dev          # server on :8787 + web dev server on :5173 (proxied)
# open http://localhost:5173
```

Production build (the server serves the built SPA):

```bash
npm run build
VAULT_PATH=./sample-vault npm start
# open http://localhost:8787
```

Useful scripts:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Run server + web together in watch mode |
| `npm run build` | Build the web SPA, then compile the server |
| `npm start` | Run the production server (serves built web) |
| `npm run typecheck` | Type-check server, web, `packages/webo` **and** `mcp-server` |
| `npm test` | Server suite (vitest) + web store suite (`node --test`) |
| `npm run webo -- --help` | The bundled process-manager CLI (see below) |
| `npm run mcp` | The bundled MCP server over stdio (needs `WEBOBSIDIAN_BASE_URL` + `WEBOBSIDIAN_API_KEY`) |
| `scripts/smoke-test.sh` | Boot the built server five times and assert the fork's behaviour (auth hardening, symlinked vault, SIGTERM teardown, Agent API read-modify-write, MCP handshake) — run `npm run build` first |

Canvas surfaces (the graph) must not read theme colours by hand: palette variables are aliases,
some are `hsl()`/`calc()` values a strict parser rejects, and the themed root is not always
`.theme-light/.theme-dark`. Use `resolveThemeColor` from `web/src/lib/cssColor.ts` and repaint when
the store's theme changes.

The server suite covers the vault write/trash/path-safety paths, git autosync and a real-git
integration run (a throwaway repo + bare remote, no network); the web suite covers the workspace
store, including preview-tab state. CI (`.github/workflows/ci.yml`) runs on pushes to `main`,
pull requests targeting `main`, and manually from **Actions → CI → Run workflow**. Three parallel
jobs check dependencies, typecheck/test/build all workspaces (including desktop packaging), and
build the Docker image. Linux browser fixtures run with Electron's sandbox and Xvfb on Ubuntu 24.04.
Smoke tests use disposable local vaults.

The **Dependency vulnerability audit** job runs the lockfile regression guard and `npm audit`
against all production and development dependencies, failing on **low, moderate, high or critical**
advisories or registry errors. Its `npm-audit` JSON artifact is retained for 14 days, including when
the audit fails. Review fixes before updating the lockfile; avoid `npm audit fix --force`.
CI uses a read-only repository token, limits job duration, and cancels superseded runs for the same
event and branch/PR. No additional secrets are needed.

---

## ⚙️ Configuration

### Docker env (`.env`, consumed by `docker-compose.yml`)

| Var | Default | Description |
|-----|---------|-------------|
| `VAULT_HOST_PATH` | `./sample-vault` | Host path bind-mounted to `/vault` |
| `HTTP_BIND` | `0.0.0.0` | Host interface to publish on (`127.0.0.1` = local only) |
| `HTTP_PORT` | `8787` | Host port mapped to container `8787` |
| `WEBOBSIDIAN_PASSWORD` | – | Seed/override the master password |
| `WEBOBSIDIAN_WATCH` | `auto` | `auto` (native + polling fallback) or `polling` |
| `WEBOBSIDIAN_RECONCILE_INTERVAL_MS` | `60000` | Metadata inventory interval; positive integer milliseconds |
| `WEBOBSIDIAN_HASH_AUDIT_INTERVAL_MS` | `1800000` | Background Markdown SHA-256 audit interval; positive integer milliseconds |

### App-level env (read by the server; Docker sets these inside the container)

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `8787` | HTTP port |
| `VAULT_PATH` | `./sample-vault` | Path to the notes vault |
| `DATA_DIR` | `./data` | Where `settings.json` + search index live |
| `ALLOWED_ROOTS` | – | Comma-separated roots the vault picker may browse |
| `WEBOBSIDIAN_PASSWORD` | – | Seed/override the master password |
| `WEBOBSIDIAN_WATCH` | `auto` | File-watch mode: `auto` or `polling` |
| `NODE_OPTIONS` | `--max-old-space-size=4096` | Node heap size — raise for large vaults |

Everything else — git remote/token, API keys, plugins, theme — is configured in the
**Settings** UI and stored in `data/settings.json`.

---

## 🤖 Agent API

Scoped REST API for AI agents at `/api/v1`. Create an API key in **Settings → API Keys**,
then pass it as a header. Full reference: **[docs/AGENT_API.md](docs/AGENT_API.md)**.

**Safe read-modify-write.** A read returns the note's `version`; pass it back as `base_version` on
the next `PUT`/`PATCH` and a concurrent edit becomes a `409 version_conflict` (with the current
version to re-read) instead of a silent overwrite. Long notes can be read in line slices
(`?offset=&limit=`), and `PATCH {"find": …, "replace": …}` edits a literal string in place —
server-side, so a stale copy can never be written back. Set `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1`
to refuse unversioned writes outright.

### 🧩 MCP server (for MCP hosts)

`mcp-server/` is a stdio [MCP](https://modelcontextprotocol.io) server that wraps this API, so
Claude Code / Codex / any MCP host gets the vault as tools (`read_note`, `edit_note`, `grep_note`,
`search_notes`, …) with the conflict rules above built in:

```bash
npm run build && npm run mcp        # needs WEBOBSIDIAN_BASE_URL + WEBOBSIDIAN_API_KEY
```

See [`mcp-server/README.md`](mcp-server/README.md) for the host config snippet.

**Remote MCP:** optional Streamable HTTP at `/mcp`, using the same API keys/scopes.
Existing stdio configuration remains supported. See [remote setup and Perplexity Pro example](docs/MCP_REMOTE.md).
HTTP MCP is disabled by default; configure an HTTPS endpoint and a scoped API key before enabling it.

### 🧩 Drop-in agent skill (no clone needed)

Want your coding agent (Claude Code, Codex, OpenCode, Cursor…) to work with your vault
directly? **Copy the block below and paste it to your agent.** It downloads the skill from
GitHub, asks for your URL + API key once, saves them to `~/.webobsidian/credentials.json`,
and can then read/write/search your notes on request.

> First create an API key in the app at **Settings → API Keys** (scopes `read`/`write`/`search`).

```text
SYSTEM / TASK — Install the "webobsidian" agent skill from GitHub, then set up credentials.
Do every step in order; do not skip the credential step.

STEP 1 — Download the skill into your runtime's skills directory
  (Claude Code: ~/.claude/skills · Codex: ~/.codex/skills · OpenCode: ~/.opencode/skills):
      SKILLS_DIR=~/.claude/skills        # change for your runtime
      mkdir -p "$SKILLS_DIR/webobsidian"
      curl -fsSL https://raw.githubusercontent.com/xnohat/webobsidian/main/docs/agent-skill/webobsidian/SKILL.md \
        -o "$SKILLS_DIR/webobsidian/SKILL.md"

STEP 2 — Set up credentials (ASK ME; never echo the key back). Ask me for my WebObsidian
  base URL (e.g. https://notes.example.com) and my API key (looks like wok_...), then:
      mkdir -p ~/.webobsidian && chmod 700 ~/.webobsidian
      printf '{ "baseUrl": "%s", "apiKey": "%s" }\n' "<BASE_URL>" "<API_KEY>" > ~/.webobsidian/credentials.json
      chmod 600 ~/.webobsidian/credentials.json

STEP 3 — Verify (do NOT print the key) and confirm ready:
      BASE=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.webobsidian/credentials.json")))["baseUrl"].rstrip("/"))')
      KEY=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.webobsidian/credentials.json")))["apiKey"])')
      curl -s "$BASE/api/v1/health"
      curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/tags" | head
  From now on, when I ask you to work with my WebObsidian / Obsidian vault, use the webobsidian skill.
```

Details & alternatives: [docs/agent-skill/INSTALL.md](docs/agent-skill/INSTALL.md) ·
canonical skill: [docs/agent-skill/webobsidian/SKILL.md](docs/agent-skill/webobsidian/SKILL.md).

```bash
KEY=wok_your_key_here
BASE=http://localhost:8787/api/v1

# list notes
curl -H "X-API-Key: $KEY" "$BASE/notes?limit=10"

# create / update a note
curl -X PUT -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"# From the agent\n\nHello vault."}' \
  "$BASE/notes/Agent/Generated.md"

# search (fielded queries supported: tag:, path:, title:)
curl -H "X-API-Key: $KEY" "$BASE/search?q=tag:idea%20graph&limit=5"
```

| Endpoint | Scope | Description |
|----------|-------|-------------|
| `GET /api/v1/notes` | read | List notes (paginated) |
| `GET /api/v1/notes/{path}` | read | Read a note + metadata |
| `PUT /api/v1/notes/{path}` | write | Create / overwrite |
| `PATCH /api/v1/notes/{path}` | write | Append content |
| `DELETE /api/v1/notes/{path}` | write | Move to trash |
| `GET /api/v1/search?q=` | search | QMD search |
| `GET /api/v1/backlinks?path=` | read | Backlinks for a note |
| `GET /api/v1/tags` | read | All tags with counts |

---

## 🏗️ Architecture

Monorepo with two npm workspaces:

```
webobsidian/
├── server/   # Express + TypeScript API
│   └── src/{routes,services,middleware,plugins}
├── web/      # React + Vite SPA (built into server/public)
│   └── src/{components,lib,styles}
├── data/     # runtime: settings.json + search index (git-ignored)
├── docs/     # AGENT_API.md, Obsidian internals notes
├── Dockerfile · docker-compose.yml · .env.example
```

```
┌──────────────────────── Browser (React SPA) ────────────────────────┐
│   CodeMirror 6 · Live Preview · File Tree · Graph · Search           │
└───────────────▲──────────────────────────────────┬──────────────────┘
                │ REST + WebSocket                  │ static assets
┌───────────────┴──────────────────────────────────▼──────────────────┐
│                  Server (Node + Express + TypeScript)                │
│   Auth gate │ Vault FS │ QMD Search │ Git Sync │ API Gate │ Plugins  │
└──────┬──────────────┬───────────┬────────────┬───────────────┬───────┘
   settings.json   Vault dir   Search index  GitHub repo    plugins dir
   (JSON config)   (.md+attach) (in-mem/disk) (git + LFS)   (.obsidian/plugins)
```

**Tech stack:** Node 22.12+ · Express · TypeScript · React · Vite · CodeMirror 6 ·
unified/remark/rehype · MiniSearch (QMD) · simple-git + git-lfs · scrypt + JWT · Docker.

See [PRD.md §2](PRD.md) for the full design.

### Live Preview geometry — why vertical margins break click placement

CodeMirror positions the caret from a **height map** that it builds out of the border-box
rects of the blocks it renders, and it assumes those blocks stack directly on top of each
other. Space that a vertical `margin` contributes between two blocks never reaches that
map: the map ends up shorter than the document, and everything below the gap maps to a
document line that is one or two rows further down — you click a row and the caret lands
on the next one. (Measured: a note title + properties block + table pushed every click two
rows low; `contentDOM.scrollHeight` was 76px longer than the map.)

So, inside the editor, **vertical spacing on an editor block is `padding`, never `margin`**:

- Block widgets (`.cm-inline-title`, `.cm-properties`, `.cm-table-wrap`, `.cm-html-preview`,
  `.cm-html-block`, `.cm-mermaid`) carry their spacing as padding. Where a decorative box
  needs its own border (`.properties`), the widget renders a wrapper that owns the spacing —
  see `FrontmatterWidget.toDOM`.
- `.cm-table-wrap` is `display: block; width: fit-content` rather than `inline-block`: an
  inline-block sits on the text baseline, and the anonymous line box around it added ~7px
  the map could not see.
- Margins *inside* a padded block are fine (a child's margin stays within the parent's box).

Two guards keep it that way: `web/tests/editorSpacing.test.ts` fails CI if a vertical margin
reappears on an editor block, and (dev builds only) `livePreviewGeometryGuard` logs a console
warning when the height map is shorter than the rendered content. Attachments that load after
layout are handled by `mediaLoadRemeasure`, which re-measures on `load`/`error`.

### CodeMirror's own colours must be re-themed

This app themes through CSS variables on a `.theme-*` wrapper and never enables CodeMirror's
`darkTheme` facet, so anything CodeMirror hard-codes for light mode stays light on every theme.
Two of those are user-visible and are overridden in `obsidian.css`:

- **The caret.** `drawSelection()` hides the native caret (`caret-color: transparent !important`)
  and paints `.cm-cursor`, whose border is hard-coded `black` (`&dark` would be `#ddd`) — on a dark
  theme the caret was black on near-black. `.cm-editor .cm-cursor, .cm-editor .cm-dropCursor`
  take `var(--text-normal)`.
- **The Find & Replace panel** (`.cm-panels`, `Ctrl+F`): hard-coded `#f5f5f5` with browser-default
  white inputs; now themed with palette variables.

Rule of thumb: when a CodeMirror default looks wrong on a theme, override it with a palette
variable — never with a literal colour. `web/tests/editorTheme.test.ts` enforces this for the
caret and the panel.

### Floating popups must mount inside the themed root

The palette variables are declared on the `.theme-*` wrapper, **not on `<body>`** — so a popup
appended to `<body>` is outside the subtree where `var(--text-normal)` & co. resolve. Every `var()`
in its CSS is then invalid at computed-value time: the text falls back to black and the background
to transparent, i.e. black-on-dark. This is what the `[[` link suggester (`lib/suggest.ts`) and the
Properties value dropdown (`lib/livePreview.ts`) did on the Catppuccin themes, because both looked
the wrapper up with `document.querySelector('.theme-light, .theme-dark')` — a two-class shortcut
that misses `theme-ctp-*` (the same trap documented in `lib/cssColor.ts`).

Mount through `themedPopupHost()` (`lib/theme.ts`), which matches every class in `THEME_CLASS` —
never re-type the two-class selector. `web/tests/themeHost.test.ts` fails if the shortcut comes
back or a mount site stops using the helper.

---

## 🔒 Security notes

- Master password is scrypt-hashed; the JWT secret is auto-generated.
- **The well-known default `123456` is refused as soon as any credential is configured** (UI
  password, `WEBOBSIDIAN_PASSWORD`, or a hand-edited `auth.passwordHash`) — it was previously accepted
  *alongside* the real password, so an instance that set an env password and never opened the UI was
  still reachable with the default. A fresh install still starts on `123456` and must change it.
- `GET /auth/status` deliberately reports nothing about whether the default is still in use (that flag
  was an unauthenticated oracle); `mustChangePassword` comes from `/auth/login` and `/auth/me`.
- API keys are hashed at rest and scoped (`read` / `write` / `search`) with per-key rate
  limiting and audit logging.
- All file paths are guarded against traversal; the vault picker is confined to
  `ALLOWED_ROOTS`.
- Secrets (git token / API keys) live in `data/settings.json` on the server — mount `/data`
  as a private volume and keep it off version control. **Change the default password.**

---

## 🗺️ Compatibility & scope

- ✅ Works directly on an existing Obsidian vault, including `.obsidian/` config.
- ⚠️ **Single-user (v1)** — no real-time multi-user collaborative editing yet.
- ⚠️ Git sync replaces Obsidian Sync/Publish.
- ⚠️ Community-plugin support is a **subset** of the Obsidian API; plugins relying on
  Electron/Node internals may not work.

---

## 🤝 Contributing

Contributions are welcome! A few house rules from [CLAUDE.md](CLAUDE.md):

1. **Follow [PRD.md](PRD.md).** It is the source of truth for design. Changing scope means
   updating the PRD first (with a changelog bump), then the code.
2. **Keep [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) in sync** — flip checkboxes and
   add a progress-log line as you work.
3. TypeScript everywhere; avoid `any`. Runtime config is JSON only (no DB engine).
4. Never log secrets/tokens; hash before storing; guard against path traversal.

Run `npm run typecheck` and `npm test` before opening a PR.

Agent-facing conventions for this repo live in [docs/agents/](docs/agents/): where work is tracked
(`issue-tracker.md`), the triage label vocabulary (`triage-labels.md`) and the domain-doc rules
(`domain.md`).

The inherited deployment workflow is restricted to the Pham source repository.
Merging this contribution does not configure an upstream deployment. Keep CI and
the disposable smoke tests passing before merging changes.

---

## 📄 License

[MIT](LICENSE) © xnohat

---

<div align="center">
<sub>Built for people who want to own their notes. Not affiliated with Obsidian.md.</sub>
</div>

### Local drafts, conflict recovery and toolbar width

The formatting toolbar measures the editor container, including changes caused by sidebars and split panes. New layouts use **One row + More**: buttons that do not fit remain available in the More menu. Existing explicitly saved Scroll/Wrap preferences are preserved; select **Settings → Editing Toolbar → Overflow → One row + More** to enable the adaptive layout.

Edits to Markdown, text and Canvas documents are journaled in browser IndexedDB. **Saved locally** means the local transaction completed; **Saved on server** means the server confirmed that revision. Open **Local drafts** to recover/compare an interrupted edit. Drafts are isolated by installation, vault and browser tab, and retained until confirmed saved or explicitly discarded. Browser storage may be unavailable, cleared or evicted; local storage errors are shown. This does not provide a complete offline application.

Normal editor saves include the base content version. A conflict preserves local text and opens an editable comparison, with a separate copy path available. If the server changes during review, review the refreshed comparison before saving again. Canvas uses whole-document selection and validates JSON. This UI resolves content-version conflicts; Git merge conflicts remain a separate future feature.

### Code file viewer

Open Python, TypeScript, shell scripts and other mapped text formats in a read-only CodeMirror viewer, including split panes. The viewer provides theme-aware highlighting, optional line numbers, Find and Copy. Configure it in **Settings → Code files**; use `plain` to disable highlighting for an extension.

Mapped existing formats such as `.js`, `.json`, `.yaml`, `.txt` and `.csv` now open read-only. Disable the viewer or remove their mappings to restore the existing text editor. Local drafts remain recoverable through the existing editor. The built-in viewer is independent of Obsidian community plugins.

Preview supports UTF-8 (including BOM), up to 10 MiB. Highlighting is disabled above 1,000,000 UTF-16 code units. Binary, invalid UTF-8 and larger files offer a download. Markdown, Canvas, media and binary attachments keep their own viewers. Hidden-file visibility is unchanged; `Dockerfile` is recognized by name. Settings apply to this WebObsidian installation and do not modify desktop plugin settings.
