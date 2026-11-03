---
name: webobsidian
description: "Read, write, search, and manage notes in a WebObsidian vault through its Agent REST API (/api/v1). Use whenever the user asks to find, read, create, update, append to, or delete notes in their WebObsidian / Obsidian vault, list tags, get backlinks, or run a vault search. Credentials (base URL + API key) are stored in ~/.webobsidian/credentials.json; if missing, ask the user for them and save them before making requests."
---

# WebObsidian Agent skill

Operate a [WebObsidian](https://github.com/xnohat/webobsidian) vault over its Agent REST
API at `/api/v1`. Everything is a plain HTTP call authenticated with an API key.

## Credentials (read these first, every session)

Credentials live in **`~/.webobsidian/credentials.json`**:

```json
{ "baseUrl": "https://your-webobsidian.example.com", "apiKey": "wok_xxxxxxxx" }
```

**Before the first request in a session**, load them into shell variables:

```bash
BASE=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.webobsidian/credentials.json")))["baseUrl"].rstrip("/"))')
KEY=$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.webobsidian/credentials.json")))["apiKey"])')
```

If `~/.webobsidian/credentials.json` does **not** exist or a call returns **401**:

1. Ask the user for their **WebObsidian base URL** (e.g. `https://notes.example.com` or
   `http://host:8787`) and their **API key**. They create the key in the app at
   **Settings → API Keys** (choose scopes `read` / `write` / `search`). Keys look like `wok_…`.
2. Save it (never echo the key back):
   ```bash
   mkdir -p ~/.webobsidian && chmod 700 ~/.webobsidian
   cat > ~/.webobsidian/credentials.json <<JSON
   { "baseUrl": "<BASE_URL>", "apiKey": "<API_KEY>" }
   JSON
   chmod 600 ~/.webobsidian/credentials.json
   ```
3. Verify with the health + an authenticated call, then proceed.

**Security rules:** never print, log, or commit the API key. Never write it into vault
notes. If a command would expose it, redact it.

## Sanity check

```bash
curl -s "$BASE/api/v1/health"                          # liveness, no auth
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/tags" | head # confirms the key works
```

## Authentication

Send the key as a header on every `/api/v1` request (either form works):

```
X-API-Key: wok_xxx
Authorization: Bearer wok_xxx
```

Scopes per key: `read`, `write`, `search`. A call outside the key's scope returns `403`.
Rate-limited (default 120 req/min/key) → `429` when exceeded; back off and retry.

## Endpoint reference

All `{path}` values are **vault-relative** and must be **URL-encoded** (`curl -G --data-urlencode`
for queries; encode `/`-containing paths in the URL path, e.g. `Notes/Ideas.md` →
`Notes%2FIdeas.md` is accepted, plain `Notes/Ideas.md` also works).

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/health` | – | Liveness check |
| GET | `/api/v1/notes?offset=&limit=&sort=&order=&folder=` | read | List markdown notes (paginated; default newest-modified first) |
| GET | `/api/v1/notes/{path}?offset=&limit=` | read | Read a note + parsed metadata + `version` (line-sliced when `limit` given) |
| PUT | `/api/v1/notes/{path}` | write | Create / overwrite — body `{"content":"...","base_version":"..."}` |
| PATCH | `/api/v1/notes/{path}` | write | Append (`{"append":"..."}`) **or** find/replace (`{"find":"...","replace":"..."}`) |
| DELETE | `/api/v1/notes/{path}` | write | Move note to trash |
| GET | `/api/v1/note-matches?path=&q=&case_sensitive=&limit=&context=` | read | Literal grep inside one note, with line numbers |
| GET | `/api/v1/search?q=&limit=` | search | QMD search (fielded: `tag:`, `path:`, `title:`) |
| GET | `/api/v1/backlinks?path=` | read | Notes linking to a path |
| GET | `/api/v1/tags` | read | All tags with counts |

## Recipes

```bash
# List 10 notes
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/notes?limit=10"

# Read a note (URL-encode the path's query value if it has spaces/slashes)
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/notes/Welcome.md"

# Create or overwrite a note
curl -s -X PUT -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"content":"# Title\n\nBody written by the agent."}' \
  "$BASE/api/v1/notes/Agent/Generated.md"

# Append to a note (creates it if missing)
curl -s -X PATCH -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"append":"\n- another bullet"}' \
  "$BASE/api/v1/notes/Agent/Generated.md"

# Edit one spot in an existing note, atomically (recommended for changes)
# 1) read it — the response carries "version"
curl -s -H "X-API-Key: *** "$BASE/api/v1/notes/Projects/Roadmap.md"
# 2) locate the exact text (line numbers + context; literal, case-insensitive by default)
curl -s -G -H "X-API-Key: *** "$BASE/api/v1/note-matches" \
  --data-urlencode "path=Projects/Roadmap.md" --data-urlencode "q=Q3 owner" --data-urlencode "context=1"
# 3) replace that literal string in place, guarded by the version you read
curl -s -X PATCH -H "X-API-Key: *** -H 'Content-Type: application/json' \
  -d '{"find":"Q3 owner: TBD","replace":"Q3 owner: Hung","base_version":"<version>"}' \
  "$BASE/api/v1/notes/Projects/Roadmap.md"

# Create a note only if it does not exist yet (base_version "")
curl -s -X PUT -H "X-API-Key: *** -H 'Content-Type: application/json' \
  -d '{"content":"# New\n\nBody.","base_version":""}' "$BASE/api/v1/notes/Agent/New.md"

# Delete a note (→ trash)
curl -s -X DELETE -H "X-API-Key: $KEY" "$BASE/api/v1/notes/Agent/Generated.md"

# Full-text search (fielded queries supported)
curl -s -G -H "X-API-Key: $KEY" "$BASE/api/v1/search" \
  --data-urlencode "q=tag:idea graph" --data-urlencode "limit=5"

# Backlinks for a note
curl -s -G -H "X-API-Key: $KEY" "$BASE/api/v1/backlinks" --data-urlencode "path=Welcome.md"

# All tags with counts
curl -s -H "X-API-Key: $KEY" "$BASE/api/v1/tags"
```

## Response shapes

```jsonc
// GET /api/v1/notes/{path}
{ "path": "Welcome.md", "content": "...", "version": "9f2c1d4a8b3e0f77",
  "totalLines": 512, "offset": 0, "limit": 80, "hasMore": true, "title": "Welcome",
  "frontmatter": { "tags": ["welcome"] }, "tags": ["welcome"], "links": ["Notes/Ideas"] }

// GET /api/v1/note-matches?path=&q=
{ "path": "Projects/Roadmap.md", "query": "Q3 owner", "count": 1, "truncated": false,
  "matches": [ { "line": 214, "text": "Q3 owner: TBD", "ranges": [{ "start": 0, "end": 8 }],
                 "pre": "…", "post": "…" } ] }

// GET /api/v1/search
{ "query": "graph", "hits": [
  { "path": "Notes/Ideas.md", "title": "Ideas", "score": 4.2, "tags": ["idea"], "snippet": "…" } ] }
```

## Obsidian Flavored Markdown (write notes in this dialect)

The vault is a real Obsidian vault — the user also opens these files in the Obsidian app,
so write **Obsidian Flavored Markdown**, not plain Markdown. Use `[[wikilinks]]` for links
between vault notes (Obsidian tracks renames); use `[text](url)` **only** for external URLs.

### Properties (YAML frontmatter)
At the very top of the note, between `---` fences. Default keys: `tags`, `aliases`,
`cssclasses`. Preserve existing frontmatter on overwrite.

```markdown
---
title: My Note
date: 2024-01-15
tags:
  - project
  - active
aliases:
  - Alternative Name
---
```

### Wikilinks (internal links)
```markdown
[[Note Name]]                 Link to a note
[[Note Name|Display Text]]    Custom display text
[[Note Name#Heading]]         Link to a heading
[[Note Name#^block-id]]       Link to a block
[[#Heading in same note]]     Same-note link
```

### Block references
Append `^block-id` to a paragraph; for lists/quotes put the id on its own line after the block.
```markdown
This paragraph can be linked to. ^my-block-id
```

### Embeds / transclusion (prefix a wikilink with `!`)
```markdown
![[Note Name]]                Embed a whole note
![[Note Name#Heading]]        Embed one section
![[image.png]]                Embed an image
![[image.png|300]]            Embed with width
![[document.pdf#page=3]]      Embed a PDF page
```

### Callouts
```markdown
> [!note]
> Basic callout.

> [!warning] Custom Title
> Callout with a custom title.

> [!faq]- Collapsed by default
> Foldable callout (`-` starts collapsed, `+` starts expanded).
```
Common types: `note`, `tip`, `info`, `warning`, `danger`, `success`, `failure`, `question`,
`example`, `quote`, `bug`, `abstract`, `todo`.

### Tags
```markdown
#tag            inline tag
#nested/tag     hierarchical tag
```
Letters, digits (not first char), `_`, `-`, `/`. Tags also go in frontmatter `tags:`.

### Tasks
```markdown
- [ ] Pending task
- [x] Completed task
```

### Other syntax
```markdown
==highlight==   **bold**   *italic*
Footnote[^1].          [^1]: Footnote text.       Inline footnote.^[Inline text.]
Visible %%hidden inline comment%% text.            $e^{i\pi}+1=0$  (inline math)
```
````markdown
$$\frac{a}{b} = c$$         (block math, KaTeX)

```mermaid
graph TD
  A --> B
```
````

## Editing rules

- **Read, then write with `base_version`.** Every read returns the note's `version`; pass it as
  `base_version` on the next `PUT`/`PATCH`. If someone (the user, another agent) edited in between,
  the call fails with `409 version_conflict` + `currentVersion` — re-read and redo the change instead
  of retrying blind. `base_version: ""` means "this note must not exist yet".
- **Prefer `PATCH {"find","replace"}` for changes to an existing note** — it edits in place, so a
  stale copy can never be written back, and it leaves the rest of the file (frontmatter, formatting,
  the user's own edits) untouched. Matching is literal: no regex, and `$&`/`$1` in the replacement are
  just characters. `409 find_ambiguous` (+ `count`) means the string occurs more than once — add
  surrounding context or set `"replaceAll": true`; `409 find_not_found` means the note changed or the
  text is not there.
- **Prefer `PATCH` append** over a full `PUT` when only adding content at the end.
- **Read before you overwrite** an existing note unless the user explicitly wants a fresh
  replace; preserve its frontmatter and formatting.
- For a long note, page it (`?offset=&limit=` are line numbers) and locate the target with
  `/note-matches` rather than pulling the whole file into context.
- Paths are **case-sensitive** and notes must include the `.md` extension.
- When you reference another note, link it (`[[Other Note]]`) instead of writing a bare name —
  it keeps the graph and backlinks intact.

## Troubleshooting

- `401` → key missing/invalid → re-run the credentials flow above.
- `403` → the key lacks the required scope → ask the user to create a key with the needed
  scope (`read`/`write`/`search`).
- `404` on a note → wrong path/casing, or it's in `.trash`.
- `429` → rate limited → wait and retry.
- `409 version_conflict` → the note changed since your read → re-read (the response's
  `currentVersion` is the version to use) and reapply your change.
- `409 find_ambiguous` / `409 find_not_found` → your `find` text is too generic or gone →
  `grep_note`/`/note-matches` for the exact surrounding text and retry.
- `400 missing_base_version` → this instance runs in strict mode → always send `base_version`
  (use `""` when creating a note).
- Connection refused / TLS error → confirm the base URL and that the server is reachable.
