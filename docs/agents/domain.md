# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`PRD.md`** (repo root) — the authoritative product/domain document for WebObsidian: FR/NFR
  numbering, data model, API surface, vault semantics. `CLAUDE.md` mandates reading it before
  changing behaviour and updating it (with a version bump + changelog line) when scope changes.
- **`IMPLEMENTATION_PLAN.md`** (repo root) — the progress log: phase/milestone checkboxes
  (`[ ]` / `[~]` / `[x]`) and the "Nhật ký tiến độ" entries. Every behavioural change gets an entry.
- **`docs/UPSTREAM_PR_MERGES.md`** — provenance of the fork: which upstream PRs are merged, the
  decisions taken while merging, and the bugs fixed in them. Read it before "fixing" something that
  looks like an obvious upstream bug.
- **`docs/adr/`** — architecture decision records, when they exist.
- **`CONTEXT.md`** at the repo root, or **`CONTEXT-MAP.md`** if it exists (it points at one
  `CONTEXT.md` per context; read each one relevant to the topic).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **single-context** (one product, one domain language), even though it is an npm
workspaces monorepo — `server/`, `web/`, `desktop/`, `packages/webo` are deployment surfaces of the
same vault/notes domain, documented by one `PRD.md`:

```
/
├── CONTEXT.md          ← created lazily by /domain-modeling (not present yet)
├── docs/adr/           ← created lazily by /domain-modeling (not present yet)
├── PRD.md              ← authoritative product/domain spec (exists)
├── scripts/, deploy/   ← local operations (integration, deploy, smoke tests)
└── server/ web/ desktop/ packages/webo/
```

Domain vocabulary already lives in `PRD.md` (FR sections) and in the code's own module names:
*vault*, *note*, *attachment*, *trash*, *share link*, *canvas*, *graph*, *plugin*, *autosync*,
*allowed roots*.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `PRD.md` / `CONTEXT.md`. Don't drift to synonyms the glossary
explicitly avoids (e.g. "file" when the domain term is *note* or *attachment*; "sync" when it is
*autosync*).

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (…), but worth reopening because…_
