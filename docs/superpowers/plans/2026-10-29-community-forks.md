# Community fork integration plan

Historical assembly plan. The upstream contribution consolidates the resulting tree into
one commit on the original project's main branch; contributor attribution is retained.
The source merge ancestry described below belongs to the assembly fork.

> Execute inline in the dedicated new repository. Preserve both source histories and review the resulting integration branch before adopting it as our main branch.

## Goal and scope

Create `macros0/webobsidian` and its local checkout, importing the complete selected revisions of both community forks. Do not deploy, access real vaults or change existing installations during integration.

## Sources

- Original: `xnohat/webobsidian` at `c41967a93317b2a0f08511c349ef3dbaf78fc882`.
- Primary integration base: `phamtruonghung/webobsidian` at `80106c6818fa44f7f92c8d894c7da71717c1980b`.
- Second merge parent: `lakylekidd/webobsidian` at `340af34a98bbc47e5a72fbf7976bb22cddb99f48`.
- Origin: `macros0/webobsidian`; local branch `integrate/pham-lakyle`.

## Decisions

- Use a real Git merge rather than copying files, retaining source attribution and future merge bases.
- Preserve Pham's authentication/path protection, PDF/download view, tasks/timeline, templates, locks, MCP/CLI workspaces and tests.
- Preserve Lakyle's sorting, explorer actions, outline, media/link previews, attachments and editing improvements.
- Disable automatic trash deletion by default in our integration (`0` days); retain the configurable feature.
- Keep upstream-specific deployment workflows guarded to their original repository; no production deployment is authorized by this task.
- Resolve overlapping documentation by recording both feature sets and identifying our fork and exact source revisions.

## Tasks

- [x] Create the GitHub fork and local checkout; configure `origin`, `upstream`, `phamtruonghung` and `lakylekidd` remotes.
- [x] Establish Pham's baseline with `npm ci`, typecheck and tests; separate any existing Windows-specific failures from integration regressions.
- [x] Merge Lakyle with `--no-ff --no-commit`, resolve the 12 conflict paths, and reconcile lockfiles/manifests.
- [x] Add focused regression coverage for overlapping write protection, sorting/state preservation and the safe trash-retention default; run it before and after any new fixes.
- [x] Update README, PRD, implementation log and source provenance; keep both source tips as merge ancestors.
- [x] Run typecheck, tests, production build and isolated runtime checks using a temporary vault only; inspect dependency audit results without automatically broadening dependency upgrades.
- [x] Obtain an independent review of the integration, fix material findings, and publish the reviewable branch to our fork.
- [x] Request opening README in Codex through its supported panel API (queued). No supported local-project registration API is exposed; the repository itself is ready to add as a project folder.

## Review follow-through

Independent review found three cross-feature regressions. Behavioral tests reproduced locked-image
deletion; the guarded handler is now tested before and after confirmation. PDF references resolve to
canonical paths before tab creation. Inline-created notes/canvases open permanent tabs. All focused
tests passed after fixes. Linux CI's health-version expectation now follows the package manifest.
Final CI adoption is recorded in `docs/FORK_INTEGRATION.md`.

## Review focus

- Read-only vault locks must still reject all browser writes, including new attachment deletion/copy/rename actions.
- Sorting and active-file reveal must survive moves/renames and Pham's preview tabs.
- PDF/binary file views and local attachment directories must remain compatible with both Markdown renderers.
- No retention sweep may delete historical `.trash` contents under default settings.
- Auth, path/symlink containment and shared-note rendering must retain Pham's safeguards.

## Completion evidence

Record the source SHAs, merge decisions, exact verification commands/results and known limitations in `docs/FORK_INTEGRATION.md`. The working service remains on its existing image until a separate deployment request.
