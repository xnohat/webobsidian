# Rendering polygon parity

**Goal:** Match a rendering test page against native Obsidian 1.14.5 while preserving note bytes.

**Observed:** The native fixture uses `.obsidian/appearance.json` baseFontSize 19, while the web default remains 16. Native preserves mixed inline color/weight, bounded padding/radius, legacy font color and custom mark colors; the current whole-style regex discards them. Native kbd has a visible keyboard-key shape. Sub/sup shorthand and backslash-parenthesized math remain literal in native, so they must not be invented as supported features.

**Design:** Read typed appearance font size through existing vault preferences, apply only to note text and public content, and remeasure the editor on preference changes. Normalize a small inert inline CSS allowlist before the shared HTML sanitizer; preserve legacy color visually without allowing arbitrary style, URLs or event attributes. Add scoped kbd styling. Match native callout title line height (1.3) and paragraph margins (1em); the measured 19px single-paragraph box is 115.2px rather than the current 81px Live box. Other page sections are compared using native and browser captures; missing references are compared as missing. Native captures use reference fixtures and a fresh profile. Native MathJax uses 19px for inline and display math at 19px note text; scope KaTeX to 1em to remove its extra default 1.21x scaling. Browser fixtures must include a doctype; quirks mode disables KaTeX and alters table inheritance.

- [x] Capture native/browser results for reference test source.
- [x] Add failing appearance and inline HTML parity tests, including unsafe CSS and outside-vault configuration guards.
- [x] Implement font-size import, scoped note typography and safe inline HTML formatting.
- [x] Verify real Live/Reading/Preview computed styles, editable-source actions and unchanged source; rerun full regressions/builds and independent review.

Validation: 385 server tests passed (10 Windows skips), 514 web tests passed; final focused typography/math and renderer-security checks passed (11). Typecheck, full build and integration smoke passed. Native/browser captures compare all eleven sections; note source hashes remain unchanged. Reviewer approved inline CSS, appearance boundaries and callout folding scope.

## Second pass: reported differences and loaded attachments

Native reference: isolated Obsidian 1.14.5 vault, reference polygon copied without edits, 19px note font. Browser references: real Editor Live/Reading and Preview, all eleven sections. Keep Bases out of scope.

- [x] Native property icons, metadata font/row scale, plain alias/cssclass values, idle date/number fields.
- [x] Partial two-space list indentation vs full four-space indentation; native dark checkbox tick.
- [x] Reset inline widget hanging indent; real click and keyboard link activation.
- [x] Callout fold arrow after title; full callout source action and unboxed raw quote editing.
- [x] Multiline display math independent of viewport parsing; source actions for math/Mermaid.
- [x] Late code fences use complete literal ranges; hidden fences add no empty rows; native language casing and right-aligned flair.
- [x] Native Mermaid palette from installed reference initialization/styles; muted Live footnote markers.
- [x] Empty/missing note embeds retain native title, accent border and open button; compact quote spacing.
- [x] Same-note fragment resolution handles heading/block links through the actual server resolver.
- [x] Genuine PDF 404 collapses to native missing-file placeholder, with complete fragment label.
- [x] Review-discovered Math source button Enter interception reproduced and fixed with real CDP keyboard input.
- [x] Generate four attachments (PNG, MP3, MP4, seven-page PDF), inspect all PDF pages, load copied fixtures in native and browser. Preserve fixture note bytes.
- [x] Native audio full note width and 42px height; deterministic WebM fixture removes MediaRecorder/GPU test flakiness without dropping playback checks.
- [x] Verify callout source button hovering body/title/away, math/Mermaid/PDF hover buttons and loaded attachment actions.
- [x] Complete full tests/typecheck/build/integration and review; verify unchanged fixture note bytes.

Browser test fixture `tests/fixtures/embeds/clip.webm` is generated from FFmpeg's synthetic testsrc (240x120, 10fps, 0.6s, libvpx yuv420p). No external/user media; fetched through the existing blob-store test route and still checked for nonzero duration and working play/pause.

Second-pass validation: 386 server tests passed (10 Windows skips), all 515 web tests passed, full typecheck/build and cross-platform integration smoke passed. Real CDP mouse hovering title/body/away and math/Mermaid blocks, keyboard Enter, loaded media play/pause and source preservation verified. Native vs loaded browser image sizes agree (640x360, 300x168.75, 300x150); native audio is full column width/42px, video is 640x360; note titles 19px/28.5px and open controls 24px. PDF full/page=3/rect references load seven-page document, page is correct and viewer height tracks page. Native rect reference behaves like page=3 too; no new rect semantics introduced. All seven authored PDF pages visually inspected. Reviewer rechecked hover cleanup, source-button keyboard isolation and scoped media styles: no material findings.
