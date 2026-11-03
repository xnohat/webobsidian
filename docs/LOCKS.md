# Vault locks — read-only notes for the browser

Some notes are not meant to be hand-edited: raw evidence whose hash *is* the record, generated
boards and indexes, the vault's own rules. A browser is very good at changing a file by accident
(a stray keystroke in a preview pane, a paste in the wrong tab), so those paths can be marked
**locked**. Locked notes stay readable and searchable — they just refuse a write from the app,
and say who maintains them and why.

```
┌ File tree        ┌ Editor ───────────────────────────────────────────────┐
│ 📄 relats/daily/ │ 🔒 Read-only. Frozen evidence — ask the agent for a   │
│ 📄 relats/raw/ 🔒│    new snapshot instead of editing this one. [Edit anyway] │
│ 📄 relats/tasks/ │                                                        │
└──────────────────┴────────────────────────────────────────────────────────┘
```

## How it works

The app already has two writers, and they are separate:

| writer | route | auth | locks apply? |
|---|---|---|---|
| the browser (you) | `/api/files/*` | session cookie | **yes** — refused with `423 locked` |
| the agent (Hermes, MCP, any API key) | `/api/v1/*` | `X-API-Key` | no — the agent keeps writing |

So a lock is a guard on the session router, not a second permission system. The agent's own
writes are untouched: it maintains locked notes, that is the point of locking them.

## Declaring a lock

The list lives **inside the vault**, at `_system/locks.json`, so it travels with the notes and can
be changed without redeploying:

```json
{
  "unlock": "confirm",
  "locked": [
    { "glob": "relats/raw/**", "reason": "Frozen evidence — a hash of this file is the record." },
    { "glob": "**/board.md", "reason": "Generated from the task pages; edit the task, not the board." }
  ]
}
```

- `glob` — vault-relative. `**` = any depth, `*` = within one segment, `?` = one character.
  Matching is case-insensitive, like the filesystems vaults live on.
- `reason` — shown to you in the editor banner and the tree tooltip. Write it as an instruction
  ("ask the agent for a new snapshot"), not as a scold ("do not touch").
- No file, or an unreadable one ⇒ nothing is locked. A broken config never blocks a write.

A lock covers **writing**, including rename, move, upload and delete — a locked area is also not a
source to move *from* through the browser. Reads, search, graph and export are unaffected.

## Unlocking (the escape hatch)

`unlock` decides what a human can do about a lock, in case it is ever wrong:

| value | behaviour |
|---|---|
| `"confirm"` (default) | the banner offers **Edit anyway**, behind a confirmation. Writes then carry `x-unlock-locked: 1` for the rest of the session. |
| `"password"` | the banner asks for the operator password; the server verifies it (the same hash the login uses). |
| `"off"` | no affordance at all. The only way to change a locked note is through the agent. |

A lock with no way out teaches people to disable the lock, which is why `confirm` is the default.
Set `"off"` if you would rather the answer be "ask the agent" every time.

## API

Requests from a session that write a locked path get:

```
HTTP/1.1 423 Locked
{ "error": "locked", "path": "relats/raw/x.md", "reason": "Frozen evidence …", "unlock": "confirm" }
```

`GET /api/files` marks each locked node with `locked: true` and `lockReason`; `GET
/api/files/content` returns the same two fields plus the configured `unlock` mode, which is what
the editor needs to render the banner without a second request.

## Tests

- `server/src/services/locks.test.ts` — glob semantics, config parsing and every unlock mode.
- `scripts/smoke-test.sh` scenario G — against a running server: the tree marks the locked note,
  a session write is refused with 423 and changes nothing on disk, the unlock header opens it, an
  unlocked note still saves, and **the agent's key writes the same locked note**.
