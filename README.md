<div align="center">

<img src="assets/logo.png" alt="WebObsidian logo" width="140" />

# WebObsidian

**A self-hosted, Obsidian-compatible web app for your Markdown "second brain".**

Point it at a folder of Markdown files and edit your notes from any browser — with a
CodeMirror editor, live preview, wikilinks, an interactive graph, full-text search,
GitHub sync (incl. Git LFS), an API for AI agents, and community-plugin support.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)

[Quick start](#-quick-start-docker) · [Features](#-features) · [Configuration](#-configuration) · [Agent API](#-agent-api) · [Development](#-local-development) · [Architecture](#-architecture)

Contribution-editor deployment: [Netlify configuration](netlify.toml) · [Cloudflare Workers](docs/CLOUDFLARE_DEPLOYMENT.md)

> 📐 Design: [PRD.md](PRD.md) · 📋 Progress: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

</div>

---

## What is this?

WebObsidian is a web application that gives you an [Obsidian](https://obsidian.md)-like
experience over a **real folder of Markdown files** living on your server. Your vault is
100% compatible with an existing Obsidian vault (including the `.obsidian/` folder) — you
can edit the same files from the Obsidian desktop app and from the web, side by side.

It is **single-user** and self-hosted: one master password protects the whole app, all
configuration lives in a plain `data/settings.json` (no database engine), and the entire
stack runs from a single `docker compose up`.

> **Why?** To access and edit your knowledge base from any browser, on any device, while
> keeping full ownership of your files — and to let AI agents read/write your vault through
> a safe, scoped REST API.

---

## ✨ Features

- 📝 **Editor & rendering** — CodeMirror 6 with live / source / reading views; wikilinks
  `[[note]]`, embeds `![[file]]`, tags `#tag`, callouts, task lists, KaTeX math and
  Mermaid diagrams.
- 🕸️ **Graph view** — force-directed graph built from your wikilinks, with fly-to node
  search and highlighting.
- 🔗 **Backlinks & outline** — right sidebar tab strip: Backlinks (linked **and** unlinked
  mentions), Outgoing links (resolved/unresolved), Tags and Outline.
- 🔍 **QMD search** — fast full-text + fielded search (`tag:`, `path:`, `title:`), fuzzy +
  prefix matching, incremental indexing, persisted to disk for fast startup.
- 🔄 **GitHub sync** — native `git` pull / commit / push with **Git LFS** for large
  attachments, optional auto-sync, and per-file **version history** (browse & restore).
- 🔐 **Login gate** — a single master password (scrypt-hashed) protects everything; JWT in
  an httpOnly cookie.
- 🌐 **Public sharing** — turn any note into a read-only, server-rendered (SEO-friendly)
  public page at `/share/<token>`, optionally password-protected.
- 🤖 **Agent API** — scoped API keys (`read` / `write` / `search`) let AI agents work with
  the vault over REST at `/api/v1`. See [docs/AGENT_API.md](docs/AGENT_API.md).
- 🧩 **Community plugins** — install Obsidian plugins from GitHub; loaded against an
  Obsidian-API compatibility shim (subset support).
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
# open http://localhost:8787
```

Out of the box it serves the bundled `./sample-vault`, so the stack boots immediately. All
deployment settings live in **`.env`** (git-ignored) — you never edit the tracked
`docker-compose.yml`, so a `git pull` / redeploy keeps your config and vault mapping intact.

## 🖥️ Desktop app (no server setup)

Prefer a native app? Grab an installer from the
[**Releases**](https://github.com/xnohat/webobsidian/releases) page — available for
**macOS / Windows / Linux** (arm64 · x64 · ia32):

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

> 🔑 **Default password is `123456`.** Log in right away, then change it in
> **Settings → Account**. To seed a different password on first run, set
> `WEBOBSIDIAN_PASSWORD` in `.env`. Forgot it? Set `WEBOBSIDIAN_PASSWORD` (plaintext) or
> `auth.passwordHash` (scrypt) as a recovery override.

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

Requires **Node ≥ 20** and `git` (+ `git-lfs` if you use LFS).

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
| `npm run typecheck` | Type-check both workspaces |

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

**Tech stack:** Node 20+ · Express · TypeScript · React · Vite · CodeMirror 6 ·
unified/remark/rehype · MiniSearch (QMD) · simple-git + git-lfs · scrypt + JWT · Docker.

See [PRD.md §2](PRD.md) for the full design.

---

## 🔒 Security notes

- Master password is scrypt-hashed; the JWT secret is auto-generated.
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

Run `npm run typecheck` before opening a PR.

---

## 📄 License

[MIT](LICENSE) © xnohat

---

<div align="center">
<sub>Built for people who want to own their notes. Not affiliated with Obsidian.md.</sub>
</div>
