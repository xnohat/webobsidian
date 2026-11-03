# Public note embeds implementation plan

**Goal:** Render published nested notes with native note-open controls and the same heading/block selection and six-level depth as the authenticated viewer.

**Architecture:** Reuse one pure Markdown transclusion module for browser and SSR. Resolve the actual canonical target against the full index before checking publication. Each child needs its own enabled, unlocked ShareRecord; the parent grants no access to child notes or assets. Scope file URLs and viewer hydration to each child publication, and keep unsupported raw HTML scope attributes sanitized away.

**Tech stack:** TypeScript, shared remark/rehype renderer, request-local publication context, bounded vault file reads, actual server and browser fixtures.

**Limits:** 64 resolution attempts, 2 MiB aggregate child body budget, six nested levels. Check permissions before reads; reject oversized children before allocation and never retain rejected bodies.

- [x] Add red SSR and access tests, extract the shared renderer and preserve existing rendering parity.
- [x] Add public source links, request-local child publication contexts and child viewer hydration.
- [x] Verify child passwords, disabled/private notes, relative/encoded filenames, parent denial, same-name shadowing and read bounds.
- [x] Independent review of access scopes, file reads and browser hydration.
- [x] Run full tests and production builds.
