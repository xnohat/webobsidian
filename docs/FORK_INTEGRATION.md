# Community integration

This contribution consolidates community work into one commit on `xnohat/webobsidian`.
Contributor attribution is retained through source credits and commit co-author trailers.
The assembly fork's intermediate commits are not ancestors of this contribution.

## Source provenance

| Source | Revision | Role |
| --- | --- | --- |
| `xnohat/webobsidian` | `c41967a93317b2a0f08511c349ef3dbaf78fc882` | Original project and contribution parent |
| `phamtruonghung/webobsidian` | `80106c6818fa44f7f92c8d894c7da71717c1980b` | Community feature source |
| `lakylekidd/webobsidian` | `340af34a98bbc47e5a72fbf7976bb22cddb99f48` | Community feature source |
| `macros0/webobsidian` | Consolidated contribution | Integration fixes, dependency updates and editor/rendering work |

The MIT license and original source credits are retained. Source-specific deployment and
scheduled issue workflows remain guarded to `phamtruonghung/webobsidian`. Desktop release
publishing and contributor routing target `xnohat/webobsidian`.

## Features and integration decisions

- Pham: authentication/path safeguards, locks/unlock flows, versioned writes, PDF/binary
  downloads, tasks/board/timeline, templates, preview tabs, themes, CLI and MCP.
- Lakyle: manual explorer sorting and shortcuts, document outline, multi-cursor and
  hanging-indent editing, note-relative attachment folders, rich links and media embeds.
- File routes retain lock metadata, content versions, PDF MIME/range responses and explicit
  download disposition while resolving attachments relative to their source notes.
- Image deletion is guarded in locked/reading notes, including changes during confirmation.
  PDF tabs retain source-note context. Newly created notes/canvases open permanent tabs.
- Markdown retains the PDF handler and external-embed transform. Theme styles from both
  sources coexist. Automatic trash retention defaults to zero (keep forever); explicit
  existing positive settings remain effective.
- Integration maintenance updates dependencies and adds advisory guards, authentication,
  filesystem, Git, settings, Markdown and browser regression coverage.
- The formatting toolbar and rendering corrections include literal identifiers, tables,
  footnotes, callouts and section/block embeds. Live code block selections stay visible
  inside block edges across themes and viewport widths.
- Remote Streamable HTTP MCP shares scoped API keys and tools with the existing stdio
  transport. Cached startup, reconciliation and hash audits keep search indexes current.
- Plugin modules use same-origin loading, lifecycle cleanup and separate web settings.
  Local draft recovery, conflict resolution and adaptive toolbar overflow preserve edits
  and keep actions available across editor widths.
- File-operation and authentication fixes preserve dirty tabs, reject occupied rename
  targets, serialize version checks/writes and validate recursive copies before publishing.

## Verification

Validation uses temporary vaults and loopback servers. Run the commands in CONTRIBUTING.md:
workspace/desktop typechecks, the complete server/web/browser test suite, production/desktop
builds, dependency checks/audit and disposable HTTP integration smoke.

Linux CI additionally runs the authentication/symlink/Agent API/MCP/shutdown smoke suite,
a clean dependency installation, Docker image build and desktop directory packaging.
Windows tests explicitly report unavailable symlink capabilities as skips.

Rendering fixtures and measured Obsidian references are under `tests/fixtures/rendering`.
Verified behavior, intentional fallbacks and remaining visual coverage are documented in
`docs/rendering-compatibility.md`.
