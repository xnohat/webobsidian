# PDF fragment parity implementation plan

**Goal:** Match observed Obsidian 1.14.5 navigation and highlighting for PDF text selections, annotation IDs and offsets.

**Architecture:** Keep the shared PDF.js viewer. Parse the Obsidian fragment in a small pure helper; apply text highlights using PDF.js public text mappings and annotation bounds using page viewport coordinates. Reapply after layer rendering and cancel pending work when the viewer is destroyed. Scope all added CSS to `.pdf-reader`.

**Tech Stack:** TypeScript, PDF.js 5.4.624, real Chrome browser fixtures.

**Reference:** `scripts/capture-obsidian-pdf-fragments.mjs` and isolated native observations in `build/obsidian-pdf-fragments/fragments.json`: `selection=0,0,0,6` highlights “Second”; `annotation=8R` draws a focused rectangle; annotation takes precedence; invalid indices produce no highlight. No PDF bytes or note source should change.

- [x] Add failing parser tests and real browser regression tests for text, annotation, offset, zoom, malformed links, independent viewers and cleanup.
- [x] Implement the focused fragment helper, connect shared viewer events, and add scoped styles.
- [x] Run focused browser checks and independent review; resolve findings.
- [x] Run full tests and production builds.

Regular vault links also preserve a PDF fragment in tab metadata and pass it to the full PDF view without changing the canonical filename. Browser tests cover re-navigation within the same PDF and all three note render modes.

The native menu probe confirms new-tab preserves highlighting. File-menu tab/split/window actions and copied browser URLs now carry the fragment. Active-tab URL sync handles same-file Back/Forward; App captures the initial hash before workspace restoration. Text-layer opacity matches native 0.2, confirmed by screenshot comparison.

Startup-history review added a URL restoration helper: workspace/deep-link resolution precedes URL observation. Three regression cases cover matching and differing persisted fragments and root workspace restore; the first user navigation must push, never erase the initial entry.
