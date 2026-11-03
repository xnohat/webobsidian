# WebObsidian Agent API (`/api/v1`)

REST API for AI agents to interact with the vault. Authenticated with an **API key**
created in **Settings → API Keys**. Pass it as either header:

```
Authorization: Bearer <key>
X-API-Key: <key>
```

Scopes: `read`, `write`, `search`. Rate limit: configurable (default 120 req/min/key).
All `{path}` values are vault-relative (URL-encode slashes are fine, e.g. `Notes/Ideas.md`).

## Endpoints

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/health` | – | Liveness check |
| GET | `/api/v1/notes?offset=&limit=&sort=&order=&folder=` | read | List markdown notes (paginated, ordered) |
| GET | `/api/v1/notes/{path}?offset=&limit=` | read | Read a note + metadata + `version` (segmented read) |
| PUT | `/api/v1/notes/{path}` | write | Create/overwrite a note (`{ "content": "...", "base_version": "..." }`) |
| PATCH | `/api/v1/notes/{path}` | write | Append (`{ "append": "..." }`) **or** atomic find/replace (`{ "find": "...", "replace": "..." }`) |
| DELETE | `/api/v1/notes/{path}` | write | Move note to trash |
| GET | `/api/v1/note-matches?path=&q=&case_sensitive=&limit=&context=` | read | Literal grep inside one note, with line numbers |
| GET | `/api/v1/search?q=&limit=` | search | QMD search |
| GET | `/api/v1/backlinks?path=` | read | Notes linking to a path |
| GET | `/api/v1/tags` | read | All tags with counts |
| GET | `/api/v1/tasks?folder=&status=&priority=&owner=&q=` | read | `type: task` notes (Kanban board state), normalised and filterable |

## Reading and editing without clobbering

Search, tags, backlinks and tasks depend on the shared server index. During initial
verification they return `503 INDEX_NOT_READY`, which is retryable and does not mean
the vault has no matching notes. Search/tags/backlinks responses include an additional
`index` status; `degraded` means the last available data may be outdated. Direct
note reads and version checks still read the underlying files. The web status and
manual repair endpoints use session authentication; they do not grant API keys
additional maintenance permissions. See [indexing and freshness](INDEXING.md).

Three things make an agent's read-modify-write cycle safe:

1. **Every read returns a `version`** — a hash of the note's bytes (`sha256`, first 16 hex chars).
   It changes when the content changes and does not depend on mtime, so git autosync touching
   files cannot fake a conflict.
2. **`base_version` on a write** turns it into a compare-and-set: the write is applied only if the
   note still has that version, otherwise the API answers `409 version_conflict` with the
   `currentVersion` to re-read. Send `""` to require that the note does not exist yet (a safe
   create). Omitting `base_version` keeps the legacy last-writer-wins behaviour; set
   `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1` on the server to refuse unversioned writes entirely
   (`400 missing_base_version`).
3. **`PATCH` with `find`/`replace`** edits in place, server-side, so nothing is ever rewritten from
   a stale copy. Matching is **literal** (no regex) and the replacement never expands `$&`/`$1`.
   A `find` that occurs more than once is refused with `409 find_ambiguous` and the occurrence
   count — add surrounding context or pass `"replaceAll": true`. `409 find_not_found` means the
   note changed under you (or the text is not there); re-read before retrying.

Version validation and persistence share the same vault mutation queue for browser and
Agent API requests. Concurrent requests with the same base version cannot both update
the note; parallel append operations preserve each addition. This guarantee covers one
server process. Independent filesystem writers (including external Obsidian and Git)
do not participate in that queue.

For long notes, read in slices (`?offset=&limit=` are **line** numbers) and locate the exact edit
target with `/note-matches` instead of pulling the whole file into context:

```bash
KEY=wok_your_key_here
BASE=http://localhost:8787/api/v1
NOTE=Projects/Roadmap.md

# 1. read the head of a long note: 80 lines from line 0
curl -s -H "X-API-Key: $KEY" "$BASE/notes/$NOTE?offset=0&limit=80"
# -> { ..., "version": "9f2c...", "totalLines": 512, "hasMore": true }

# 2. find the exact line to edit (literal, case-insensitive by default)
curl -s -H "X-API-Key: $KEY" "$BASE/note-matches?path=Projects%2FRoadmap.md&q=Q3%20owner&context=1"
# -> { "count": 1, "matches": [ { "line": 214, "text": "Q3 owner: ...", "ranges": [...] } ] }

# 3. edit that one spot atomically (version-guarded)
curl -s -X PATCH -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"find":"Q3 owner: TBD","replace":"Q3 owner: Hung","base_version":"9f2c..."}' \
  "$BASE/notes/$NOTE"
# -> { "ok": true, "replaced": 1, "version": "1ab4..." }
# 409 version_conflict / find_ambiguous / find_not_found => re-read, do not retry blindly
```

## Examples

```bash
KEY=wok_your_key_here
BASE=http://localhost:8787/api/v1

# list notes: newest first by default, or ask for another order
curl -H "X-API-Key: $KEY" "$BASE/notes?limit=10"
curl -H "X-API-Key: $KEY" "$BASE/notes?folder=Wiki&sort=name&order=asc"

# read a note
curl -H "X-API-Key: $KEY" "$BASE/notes/Welcome.md"

# create a note, refusing to overwrite an existing one (base_version "")
curl -X PUT -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"# From the agent\n\nHello vault.","base_version":""}' \
  "$BASE/notes/Agent/Generated.md"

# update it, only if nobody else wrote in between
curl -X PUT -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"# From the agent\n\nUpdated.","base_version":"<version from the read>"}' \
  "$BASE/notes/Agent/Generated.md"

# append
curl -X PATCH -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"append":"\n- a new bullet"}' "$BASE/notes/Agent/Generated.md"

# search (fielded queries supported: tag:, path:, title:)
curl -H "X-API-Key: $KEY" "$BASE/search?q=tag:idea%20graph&limit=5"

# backlinks
curl -H "X-API-Key: $KEY" "$BASE/backlinks?path=Welcome.md"

# tasks board (FR-15): every type: task note, or a filtered subset
curl -H "X-API-Key: $KEY" "$BASE/tasks"
curl -H "X-API-Key: $KEY" "$BASE/tasks?folder=Wiki/tasks&status=blocked&owner=hung"
```

## Response shapes

```jsonc
// GET /notes?sort=modified&order=desc&folder=Wiki&offset=0&limit=100
{
  "total": 42, "offset": 0, "limit": 100,
  "sort": "modified", "order": "desc", "folder": "Wiki",
  "notes": ["Wiki/log.md", "..."]
}

// GET /notes/{path}?offset=&limit=   (limit omitted = the whole note)
{
  "path": "Welcome.md",
  "content": "...",
  "version": "9f2c1d4a8b3e0f77",
  "totalLines": 512, "offset": 0, "limit": 80, "hasMore": true,
  "title": "Welcome to WebObsidian",
  "frontmatter": { "tags": ["welcome"] },
  "tags": ["welcome", "getting-started"],
  "links": ["Notes/Ideas"]
}

// GET /note-matches?path=&q=
{
  "path": "Projects/Roadmap.md", "query": "Q3 owner", "caseSensitive": false,
  "count": 1, "truncated": false,
  "matches": [ { "line": 214, "text": "Q3 owner: TBD",
                 "ranges": [{ "start": 0, "end": 8 }], "pre": "...", "post": "..." } ]
}

// GET /search
{ "query": "graph", "hits": [
  { "path": "Notes/Ideas.md", "title": "Ideas", "score": 4.2, "tags": ["idea"], "snippet": "..." }
] }

// GET /tasks?folder=&status=&priority=&owner=&q=  (all params optional; sorted by path)
{ "tasks": [
  {
    "path": "Wiki/tasks/deliver-2027-budget-planning.md",
    "title": "Deliver the 2027 budget plan to the manager",
    "status": "open", "statusRaw": "open",
    "priority": "P1", "owner": "hung",
    "due": "2026-09-29", "raised": "2026-09-15", "created": "2026-09-15", "updated": "2026-09-15",
    "tags": ["action-item", "planning", "budget"]
  }
] }
```

`status` is the canonical column id (`open` / `in-progress` / `blocked` / `done`) when the note's
`status:` frontmatter is canonical or a known alias (`todo`→open, `doing`/`wip`→in-progress,
`waiting`/`on-hold`→blocked, `closed`/`completed`/`complete`→done); an unrecognised value is kept
verbatim (its own board column) instead of being coerced; a missing `status:` key defaults to
`open` with `statusRaw: null`. A note only appears here when its frontmatter `type` is `task` and
no path segment is named `templates` (so `Wiki/templates/task.md` itself is excluded).

## Error responses

| Status | `error` | Meaning |
|--------|---------|---------|
| 400 | `missing_base_version` | strict mode is on and the write carried no `base_version` |
| 400 | `invalid_body` | `find` was sent together with `append`, or `find`/`replace` is not a string |
| 400 | `missing_query` | `/note-matches` was called without `q` |
| 404 | `Not found` | no such note (or the path escapes the vault) |
| 409 | `version_conflict` | someone else wrote first — response includes `currentVersion` |
| 409 | `find_ambiguous` | `find` occurs more than once — response includes `count` |
| 409 | `find_not_found` | `find` is not in the note (anymore) |

## MCP server

Agents that speak [MCP](https://modelcontextprotocol.io) can use this API through the bundled
stdio server instead of hand-writing HTTP calls — see [`mcp-server/README.md`](../mcp-server/README.md).
It exposes `read_note` / `write_note` / `edit_note` / `grep_note` / `search_notes` and friends,
with `base_version` plumbed through, so the conflict rules above apply unchanged.

### Remote MCP

The optional `/mcp` endpoint exposes Streamable HTTP alongside the existing stdio server.
It reuses WebObsidian API keys and scopes, checked per request; `/api/v1` remains REST.
Enable explicitly; see [configuration, Perplexity example and validation status](MCP_REMOTE.md).
