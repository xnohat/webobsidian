# Pele diagram migration implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, then request one whole-change review. Steps use checkbox syntax for tracking.

**Goal:** Match Obsidian 1.15.0 diagrams, using isolated reference fixtures, without changing Markdown source.

**Architecture:** One lazily loaded Pele mounting adapter serves editor widgets and HTML previews, including nested note embeds. Pele owns responsive layout and zoom; callers own source buttons, navigation, and disposal. Map Obsidian's `--mermaid-*` theme variables to Pele variables and remove the previous dark-theme inversion.

**Tech stack:** React, CodeMirror 6, Pele 1.8.0 (the version in installed Obsidian 1.15.0), existing KaTeX, real Chromium browser fixtures.

**Spec:** The design is the Architecture paragraph above; native bundle `lib/pele.min.js` and theme CSS are read-only reference evidence.

## Constraints and review focus

- Keep `mermaid` Markdown fence syntax and persisted note content unchanged.
- Share rendering, error handling, theme mapping and disposal between editor/preview.
- Preserve hover source actions in editable Live mode and hide them in readonly modes.
- Theme changes must update colors without inversion; resizing must not expand the workspace.
- Stop observers, zoom listeners and pending mounts when widgets disappear.
- Treat link targets as untrusted; internal links use the app's existing note navigation.
- Typeset formula labels with existing KaTeX with `trust: false`; display malformed input as text.
- Check source edits, duplicate SVG IDs, malformed diagrams, links and callbacks, math, hidden/replaced mounts, narrow widths, and zoom keyboard input.

## Tasks

### 1. Shared renderer and native theme

Files: create `web/src/lib/diagram.ts`; update `web/package.json`, lockfile, `web/src/styles/obsidian.css`; replace `web/src/lib/mermaidConfig.ts`.

- [x] Add real-browser regression tests for new SVG classes, native node/line/text colors in both themes, source preservation and resize containment; confirm failure against current editor/preview.
- [x] Implement `mountDiagram(element, source, options): () => void`, with lazy Pele import, scoped math measurement, internal/external navigation, error handling and cancellable disposal.
- [x] Verify malformed input and unsafe callbacks/links cannot execute; remove obsolete Mermaid dependency and its duplicate KaTeX tests, retain web KaTeX regressions.

### 2. Integrate all rendering surfaces

Files: update `web/src/lib/livePreview.ts`, `web/src/components/Preview.tsx`; create `web/tests/peleDiagramsBrowser.test.ts` and update affected tests.

- [x] Connect editor widget mounting, source button placement, CodeMirror measurement, and `destroy()` cleanup.
- [x] Connect HTML preview/nested diagram mounting and effect cleanup.
- [x] Verify both modes, hover source controls, source editing, internal/external links, formula labels, multiple diagrams, responsive layout, zoom and error recovery with real browser input.

### 3. Verify

- [x] Compare polygon flowchart and sequence geometry with installed Obsidian 1.15 using owned fixtures and screenshots; verify both themes against the native theme CSS.
- [x] Run targeted tests, typecheck, build, full tests, dependency checks/audit; review the complete change and address findings.

## Execution ledger

- Native reference: installed Obsidian 1.15.0 bundles Pele 1.8.0. Its theme uses normal text/lines, secondary surface, hover border and eight standard palette colors.
- Ruling: pin 1.8.0 to match the actual reference rather than assuming the newest Pele release renders identically. Check npm audit during validation.

- Verification: native Obsidian and actual Chrome polygon flowcharts both render at 730 × 600 with Pele 1.8.0. Targeted browser/polygon/KaTeX checks pass; keyboard zoom/reset checked separately. npm audit (production) reports zero vulnerabilities.
- Review fixes (RED then GREEN): preserve embedded note origin before replacing fence DOM; rehydrate identical HTML on note changes; pass displayed paths for split/Canvas file previews; disable competing Pele zoom inside Canvas. Fresh reviewer confirmed no further findings.
- Final theme regression: defaults belong on the theme root so inherited `--mermaid-*` overrides reach diagrams. RED reproduced the override being masked; GREEN covers parent overrides in every rendering surface.
- Completed: final typecheck/build, 390 server tests (10 Windows skips), 516 web tests, 3 MCP tests, dependency baselines, full npm audit (zero findings) passed.
