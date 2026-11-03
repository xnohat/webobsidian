# Saved browser draft cleanup

**Goal:** Automatically remove browser recovery copies whose complete text exactly matches the saved file in the same vault.

**Approach:** Extend recovery refresh with a throttled, single-flight cleanup pass (at most every 30 seconds during ordinary polling; explicitly recheck on focus, successful save and filesystem events). Group copies by path and read each server file once with its captured draft scope. Only delete matching browser records with an atomic revision/content/scope/session check. Preserve differing text, missing/offline files, active unsaved editor copies, and copies open in the comparison dialog. Never write or delete a vault file. Existing manual recovery stays available.

**Steps:**

- [x] Reproduce stale matching recovery entries in a real browser test; cover mismatches, unavailable/deleted files, concurrent edits, scope invalidation and protected active copies.
- [x] Add grouped cleanup and conditional IndexedDB deletion, integrate with recovery lifecycle. Filesystem and save events check affected paths only; ordinary full scans keep an independent 30-second throttle.
- [x] Run focused and full tests, web build, and independent review. Update product/implementation notes.

Validation: 9 focused tests passed. Full suite: 345 server tests and 455 web tests passed, 10 server skips. Web build passed. Review's unrelated-file read amplification finding was reproduced, fixed with path-scoped checks, and independently re-reviewed with no remaining findings.
