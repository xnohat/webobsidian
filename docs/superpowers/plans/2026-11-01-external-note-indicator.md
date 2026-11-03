# External note change indicator

**Goal:** Notify the reader when an open Markdown article changes outside the browser, with an explicit refresh action.

**Design:** A banner above the editor checks the active document through the existing read API on filesystem notifications, focus/visibility return, and every 30 seconds while visible. Compare with the document session's acknowledged server version/content, so normal autosave does not trigger the banner. Keep the displayed text until the user chooses an action.

**Safety:** Re-read before refreshing, and reject stale responses after navigation, vault changes, intervening typing, or saves. Clean documents can accept the latest server text without writing a file. Documents with local edits use the existing comparison/recovery dialog. Connection failures must be visible when attempting refresh and must not masquerade as an external edit.

**Approach:** Use the existing filesystem event stream plus a low-frequency visible-tab fallback. Automatic reload would hide changes from the reader; polling alone would delay notifications. Only the active Markdown article is included; split preview support is separate.

**Implementation:**

- [x] Add browser regression coverage for external changes, own saves, refresh, local edits, delayed replies and navigation.
- [x] Add a focused component and mount it above the article editor; reuse the existing comparison dialog.
- [x] Run browser regressions, typecheck/build, and the project tests; review the patch.

Validation: 8 focused tests passed, including the real Workspace/Editor and existing recovery tests. Full suite: 345 server and 454 web tests passed, 10 server skips. Web TypeScript/Vite build passed. Independent review reported no actionable findings.
