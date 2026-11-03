# @webobsidian/mcp-server

An [MCP](https://modelcontextprotocol.io) server that wraps WebObsidian's [Agent API](../docs/AGENT_API.md)
(`/api/v1`) so any MCP host (Claude Desktop, Claude Code, Codex, Hermes, …) can read, write and
search a vault as tools — no custom skill, no hand-written REST calls.

It's a thin stdio client: no new server endpoints, no new settings, just a process that forwards
tool calls to a WebObsidian instance you already run.

> Adopted from the fork [`Absenthome/webobsidian`](https://github.com/Absenthome/webobsidian)
> (`mcp-server/`), extended with the read-modify-write surface this fork added to the Agent API
> (segmented reads, content versions, atomic find/replace, per-note grep). See
> [`docs/UPSTREAM_PR_MERGES.md`](../docs/UPSTREAM_PR_MERGES.md) → "Adopted from other forks".

## Setup

1. Start WebObsidian (locally or self-hosted) and create an API key in **Settings → API Keys**
   with the scopes you need (`read` / `write` / `search`).
2. Build it: `npm run build` from the repo root (or `npm --workspace mcp-server run build`).
3. Register it with your MCP host, pointing at `mcp-server/dist/index.js` and passing the two
   environment variables:

```jsonc
// Claude Desktop's claude_desktop_config.json / Claude Code's mcpServers config
{
  "mcpServers": {
    "webobsidian": {
      "command": "node",
      "args": ["/absolute/path/to/webobsidian/mcp-server/dist/index.js"],
      "env": {
        "WEBOBSIDIAN_BASE_URL": "http://localhost:8787",
        "WEBOBSIDIAN_API_KEY": "wok_your_key_here"
      }
    }
  }
}
```

Or with a CLI:

```bash
claude mcp add webobsidian \
  --env WEBOBSIDIAN_BASE_URL=http://localhost:8787 \
  --env WEBOBSIDIAN_API_KEY=wok_your_key_here \
  -- node /absolute/path/to/webobsidian/mcp-server/dist/index.js
```

| Env var | Default | Required |
|---|---|---|
| `WEBOBSIDIAN_BASE_URL` | `http://localhost:8787` | no |
| `WEBOBSIDIAN_API_KEY` | – | **yes** (the process exits with a message on stderr if unset) |

## Tools

| Tool | Agent API endpoint | Scope |
|---|---|---|
| `list_notes` (`offset`, `limit`, `folder`, `sort`, `order`) | `GET /api/v1/notes` | read |
| `read_note` (`path`, `offset`, `limit`) → content + `version` + `totalLines` + `hasMore` | `GET /api/v1/notes/{path}` | read |
| `write_note` (`path`, `content`, `base_version`) | `PUT /api/v1/notes/{path}` | write |
| `append_note` (`path`, `content`) | `PATCH /api/v1/notes/{path}` | write |
| `edit_note` (`path`, `find`, `replace`, `replace_all`, `base_version`) | `PATCH /api/v1/notes/{path}` | write |
| `grep_note` (`path`, `q`, `case_sensitive`, `limit`, `context`) | `GET /api/v1/note-matches` | read |
| `delete_note` (`path`) | `DELETE /api/v1/notes/{path}` | write |
| `search_notes` (`query`, `limit`) | `GET /api/v1/search` | search |
| `get_backlinks` (`path`) | `GET /api/v1/backlinks` | read |
| `list_tags` | `GET /api/v1/tags` | read |

**Editing safely.** `read_note` returns a `version`; pass it back as `base_version` to `write_note`
or `edit_note` and a concurrent change turns into an error (`409 version_conflict`) instead of a
silent clobber. `base_version: ""` means "this note must not exist yet". `edit_note` does a literal
find/replace in place — if `find` matches more than once the tool returns the occurrence count so
the model adds context or sets `replace_all: true`. `grep_note` gives the line numbers to build
that exact `find` from.

API errors (missing scope, 404, conflict, rate limit) come back as MCP tool errors carrying the
original Agent API message — nothing is retried or swallowed.

## Dev

```bash
npm --workspace mcp-server run dev        # run with tsx, no build step
npm --workspace mcp-server run typecheck
npm --workspace mcp-server run build
npm --workspace mcp-server test           # e2e: spawns the built server against a running instance
```

`npm --workspace mcp-server test` needs `WEBOBSIDIAN_BASE_URL` and `WEBOBSIDIAN_API_KEY` and skips
itself without them; `scripts/smoke-test.sh` boots a throwaway instance, mints a key and runs it.

## Remote transport

The main WebObsidian server can also expose the same ten tools over stateless Streamable HTTP at `/mcp`. The stdio command above is unchanged and never opens a port. Remote HTTP is disabled by default. See [HTTPS setup, Perplexity Pro example and validation status](../docs/MCP_REMOTE.md). Library consumers can import `createMcpServer` from `@webobsidian/mcp-server/server` without starting stdio or reading credentials.
