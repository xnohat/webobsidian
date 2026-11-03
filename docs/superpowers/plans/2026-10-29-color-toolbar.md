# Color toolbar implementation plan

**Goal:** Add text/background colors and a floating selection toolbar to the existing editor.
**Architecture:** Reuse toolbar buttons with explicit EditorView targets. Hex-only inline span styles keep notes compatible with Obsidian; the Markdown sanitizer admits only these color declarations. CodeMirror tooltips own selection positioning and lifecycle.
**Tech stack:** Existing React 18, CodeMirror 6, node:test and hidden Electron browser fixtures.
**Spec:** PRD.md, FR-2 formatting extension 2026-10-29, as requested by the user.

## Constraints and decisions

- Work in the existing checkout, preserving the user's uncommitted HTML preview fix and documentation.
- No commits, deployment, real vault access, or new dependencies.
- Extend the native panel as selected by the user; adapting the external plugin is outside scope.
- Palette offers named presets, custom hex colors, and reset. Apply to selection or word at caret.
- Recolor/reset an exact existing color span without accumulating wrappers; apply multiline selections line by line.
- Disable all toolbar actions in read-only editors. Floating panel only for a nonempty selection; Escape dismisses until selection changes.
- Check selection retention, undo, safe rendering, viewport bounds, lock transitions and cleanup.

## Task 1: Color commands and rendering

- [x] Write command/renderer tests; run and observe missing-feature failures.
- [x] Add `applyColor(view, property, color)` in `web/src/lib/colorFormatting.ts`; validate hex, update/reset wrappers, preserve selection and history.
- [x] Admit only safe color span styles in `web/src/lib/markdown.ts`; run tests.

## Task 2: Shared controls and floating panel

- [x] Extend `FormatToolbar.tsx` with reusable targeted buttons and palettes; guard read-only actions.
- [x] Add `selectionToolbar.tsx` with CodeMirror state/tooltips, React lifecycle cleanup and Escape dismissal; mount from Editor.tsx.
- [x] Style palettes/tooltips in obsidian.css, including touch targets, theme and print behavior.
- [x] Add hidden browser tests of actual controls, selection, undo, locking and tooltip geometry; observe failure before implementation, then pass.

## Task 3: Verification

- [x] Run npm test, npm run typecheck, npm run build and disposable integration smoke.
- [x] Review changes, fix confirmed issues, update implementation checkboxes and record results.

## Execution ledger

- 2026-10-29: Requirements already specify the chosen native-toolbar approach; settle palette and tooltip details locally and execute inline.
- Verification: 186 server and 205 web tests passed; 7 server Windows symlink skips. Browser test covers 24 assertions each on desktop and narrow/mobile layout, including colors with inline code/emphasis in Live and Reading. Typecheck, full build and disposable HTTP integration smoke passed.
- Independent review: fixed all three reported issues with failing-then-passing regressions: balanced nested spans for reset/recolor, Markdown block prefixes outside color markup, and inline-code overlap limited to the HTML tags themselves. Reviewer confirmed all fixes.
- Preserved the existing uncommitted literal-angle-bracket rendering fix. Formatting guards now also react to lock changes. Note changes remount the static toolbar to clear stale palettes.
