# Workspace note fragment and block transclusion plan

**Goal:** Match native opening of embedded note headings/blocks and retain task/quote/callout formatting in block transclusions.

**Design:** Reuse parser-owned fragment ranges for both block selection and navigation. Preserve the enclosing list item or blockquote when selecting inline block IDs. Carry an ephemeral note navigation request through the existing openFile transaction; Editor reveals the matching source range, HTML Preview finds root-only heading/block targets. Existing PDF navigation stays unchanged. No Bases/dependency changes. Native reference uses an isolated Obsidian 1.14.5 vault.

- [x] Capture native block transclusion structure; add failing range/render tests.
- [x] Add failing real browser source-button navigation in Live/Reading/Source and HTML Preview, plus store propagation tests.
- [x] Implement shared ranges and exact block structure selection.
- [x] Wire note navigation through openFile and the two view adapters; repeated same-file requests must work, stale requests must not jump another document, sources must remain unchanged.
- [x] Verify focused browser and unit tests, review, full suite and builds.

Validation before the full gate: native8 block shapes confirmed; focused unit60 and actual four-mode HTTP/Electron browser scenarios passed. Review findings for literal URL canonicalization and same-file Back to an empty fragment were reproduced red, fixed, and verified green. Note navigation is ephemeral; browser URL preserves a reload/history target without persisting a cursor across devices. Late resolver and new-filename fragment regressions are covered.
