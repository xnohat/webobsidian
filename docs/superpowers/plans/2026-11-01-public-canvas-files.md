# Public Canvas file cards implementation plan

**Goal:** Match native Canvas file-card contents and source controls in the public read-only board, including headings and PDF controls, without inheriting access to private descendants.

**Reference:** Isolated Obsidian 1.14.5, `scripts/capture-obsidian-canvas-files.mjs`: notes and section-only cards, image cards, PDF viewer and generic-file cards; labels appear above card borders.

**Architecture:** Inject a permission-aware card renderer into the pure Canvas layout. Reuse the request-local published-note renderer and its 64-attempt/2 MiB budget across cards. Canvas file paths are literal vault-root paths; note assets retain their own share scope. Explicit Canvas file/text attachments form an allowlist without reading note descendants. Embedded boards use an independently unlocked board publication where present, otherwise the existing parent grant only. Public card controls and scrolling must not trigger viewport pan/zoom.

- [x] Add failing access/allowlist tests and actual browser card/interaction scenarios.
- [x] Extract shared attachment target discovery and literal Canvas path handling.
- [x] Reuse bounded published-note rendering across file cards, including subpath selection.
- [x] Hydrate PDF/media cards, add source links and isolate card input from board gestures.
- [x] Independent review and full regression/builds.

Validation before release: isolated native capture passed; 375 server + 502 web tests passed, 10 server tests skipped; both builds passed. Actual pointer, wheel, keyboard, PDF painting and source navigation were checked on the production frontend build. Independent review found no material issues.
