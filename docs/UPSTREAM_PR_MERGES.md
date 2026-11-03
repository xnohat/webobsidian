# Merged upstream PRs (fork integration)

This fork (`phamtruonghung/webobsidian`) exists so that **all 17 open pull requests against
`xnohat/webobsidian` are live in one build**, regardless of whether upstream merges, closes, or
deletes anything. Nothing here depends on the upstream repository staying available: the merge
commits below contain every change in-tree, and the `upstream-pr-*` tags pin the exact head commit
of each PR.

- Integration branch: `integration/upstream-open-prs`, merged into `main`.
- Base: upstream `main` @ `c41967a` (`chore(release): v0.1.1`).
- Upstream refs fetched as `upstream/pr/<n>` from `https://github.com/xnohat/webobsidian` `refs/pull/<n>/head`.

## What was merged

| PR | Title | Author | Upstream head | Merge commit |
|----|-------|--------|---------------|--------------|
| [#2](https://github.com/xnohat/webobsidian/pull/2) | fix(settings): authorize vault path against operator roots, not the request body | @metaember | `a85c5a1` | `dfff7de` |
| [#3](https://github.com/xnohat/webobsidian/pull/3) | fix(canvas): drop unsafe URL schemes on shared canvas link nodes | @metaember | `1aac53a` | `574865b` |
| [#4](https://github.com/xnohat/webobsidian/pull/4) | fix(auth): stop accepting the default password once an override is set | @metaember | `d441c16` | `4ffe2f3` |
| [#6](https://github.com/xnohat/webobsidian/pull/6) | test: vault write/trash/path-safety + git autosync coverage | @metaember | `4e2ccf7` | `d2561eb` |
| [#7](https://github.com/xnohat/webobsidian/pull/7) | test: real-git integration (init/commit/status/log/sync) | @metaember | `2f70e96` | `74b3b7e` |
| [#8](https://github.com/xnohat/webobsidian/pull/8) | i18n: translate the Account settings tab to English | @metaember | `a4b120a` | `409ce44` |
| [#9](https://github.com/xnohat/webobsidian/pull/9) | chore: translate code comments to English | @metaember | `aaf9c16` | `cafc3f5` |
| [#10](https://github.com/xnohat/webobsidian/pull/10) | fix(theme): dark-mode inherited text rendered unthemed | @metaember | `c97c920` | `d4e8ba8` |
| [#11](https://github.com/xnohat/webobsidian/pull/11) | feat(themes): Catppuccin flavors (Mocha/Macchiato/Frappé/Latte) | @metaember | `822d129` | `1fbf81d` |
| [#13](https://github.com/xnohat/webobsidian/pull/13) | fix(web): decode percent-encoded image targets before re-encoding | @robertjustjones | `5af1b61` | `f0538ec` |
| [#14](https://github.com/xnohat/webobsidian/pull/14) | fix(livePreview): CommonMark delimiter rules for table-cell italics | @robertjustjones | `e8a66db` | `adc012d` |
| [#15](https://github.com/xnohat/webobsidian/pull/15) | fix(auth): reject the default password once an override is configured | @latticelabs-au | `918faab` | `e201089` |
| [#23](https://github.com/xnohat/webobsidian/pull/23) | fix(vault): follow symlinks within allowedRoots | @JulienJBO | `63d0a2a` | `55fa72c` |
| [#24](https://github.com/xnohat/webobsidian/pull/24) | chore: refresh audited dependencies | @philpalmieri | `89ce1c3` | `302edaa` |
| [#25](https://github.com/xnohat/webobsidian/pull/25) | Graph panel: mobile touch, node dragging, and ghost-node fix | @CloudaxDM | `842cd5a` | `dc06f0a` |
| [#27](https://github.com/xnohat/webobsidian/pull/27) | feat: add `webo` CLI process manager (#FR-14) | @ziuus | `6f49938` | `ce7e7f2` |
| [#29](https://github.com/xnohat/webobsidian/pull/29) | feat: reusable preview tabs for browsing notes | @Jeff-SCG | `087515a` | `e836516` |

Merge order was deliberately lowest-risk first (single-file fixes → the stacked test PRs #2/#6/#7
→ auth → UI/themes → vault → CLI/themes → lockfile last), so each step could be verified on its own.

## Decisions taken while merging

**#4 vs #15 — the same auth bug, two designs.** Both were kept as one union rather than picking a
winner: `checkPassword()` accepts the well-known default only when
`allowDefault && isDefaultPasswordActive(auth)` — #4's opt-in gate at the login route plus #15's
single shared policy (`userPasswordHash`/`passwordHash`/`WEBOBSIDIAN_PASSWORD` all unset). #15's
`hasCustomPassword()`/`redactSettings()` now derive from that same predicate, so "the default is a
valid credential" and "the UI must force a change" can never disagree. One consequence is
deliberate and documented in `server/src/services/auth.test.ts`: under an override, `123456` is
refused as a login *and* as a "current password" too, because `mustChangePassword` is now false in
exactly that state (the ForceChangePassword screen only appears while `123456` actually works).

**Docs conflicts (`IMPLEMENTATION_PLAN.md`, `PRD.md`).** Both files are append-only logs where each
PR adds its own entry; the merge keeps every entry (newest first) and collapses the duplicated
`Cập nhật lần cuối:` / `Phiên bản:` header lines into one, per each file's own convention.

**Root `test` script.** #29 added a root `test` that ran only its own web test file, which would have
hidden the server suite from #6/#7. Root `npm test` runs both: `vitest` (server) + `node --test` (web).

**Root `typecheck`.** #27 added the `packages/webo` workspace but did not add it to the root
`typecheck` script — which is how that package shipped with two `tsc` errors. It is included now.

**Bugs found in the merged PRs themselves (fixed here):**
- `server/src/index.ts` — #27 annotated `startWatcher(): chokidar.FSWatcher` without returning the
  watcher: `TS2355` on build, and `watcher.close()` in its own SIGTERM handler would throw on
  `undefined`. Added `return watcher;`. Note the watcher's polling-fallback path still swaps in a
  second watcher internally; the handle returned to the shutdown handler is the original one.
- `packages/webo/src/bin.ts` — the `spawnEnv` object spread inferred `{ NODE_ENV: string }`, so
  `spawnEnv.PORT`/`HOST` were `TS2339`. Typed as `NodeJS.ProcessEnv`.
- `server/src/services/vault.test.ts` — #23's `getAllowedRoots()` reads `vault.allowedRoots`, which
  the #6 fixture did not provide (19 tests threw). Fixture fixed and #23's feature gained the tests
  it shipped without (symlinked folder listed, file read through a link, write landing in the
  target, link outside every allowed root still refused, cycle guard, broken link skipped).
- `package-lock.json` — #24's promise of "0 production advisories" no longer held (advisories
  published after it: xmldom, multer, js-yaml, qs/express). `npm audit fix --omit=dev` re-run:
  0 production advisories, no manifest changes.

## Verified state of this fork

Every step was checked with the project's own gates (`npm run typecheck`, `npm run build`,
`npm test`), and the install is reproducible from the committed lockfile:

```
npm ci                 # lockfile is consistent with all 5 workspaces
npm run typecheck      # server + web + packages/webo
npm test               # 72 server assertions (vitest) + 11 web assertions (node --test)
npm run build          # web bundle + server tsc + webo CLI
npm audit --omit=dev   # 0 vulnerabilities
scripts/smoke-test.sh  # 9 runtime assertions against the built server
```

`scripts/smoke-test.sh` boots the built server three times (fresh install / `WEBOBSIDIAN_PASSWORD`
override / symlinked vault) and asserts over HTTP what unit tests can't reach: `GET /auth/status`
carries no `mustChangePassword`, `123456` logs in only on a fresh install and is refused with an
override (while the override itself works and does not force a change), a symlinked folder is listed
and read through the API, and each boot logs the full 5-line teardown on `SIGTERM`. CI runs
`npm test` and the smoke test on every push and PR (`.github/workflows/ci.yml`).

## Adopted from other forks

Not every good change to this project is an open PR. Fork survey (all 115 forks of
`xnohat/webobsidian`, compared with `main...<fork>:<default_branch>`): 13 forks carry work upstream
does not have. The two below were worth taking — re-implemented against this tree rather than
cherry-picked, because their branches had drifted; each keeps a pointer to its origin in the code.

| From | What | Where it lives here |
|------|------|---------------------|
| [`blueberry6401/webobsidian`](https://github.com/blueberry6401/webobsidian) | Agent API read-modify-write: content `version` on every read, `base_version` compare-and-set on write, atomic literal find/replace via `PATCH`, `/note-matches` grep with line numbers, `sort`/`order`/`folder` on `GET /notes`, segmented reads (`?offset=&limit=` in lines) | `server/src/services/{noteversion,noteedit,notegrep}.ts`, `server/src/services/vault.ts` (`listMarkdownFilesSorted`), `server/src/routes/agent.ts` |
| [`Absenthome/webobsidian`](https://github.com/Absenthome/webobsidian) | MCP server (`mcp-server/`): stdio wrapper over the Agent API, so MCP hosts get the vault as tools | `mcp-server/` (10 tools; extended with `edit_note`/`grep_note`/segmented `read_note`/`base_version`) |

Deliberate deviations from the sources, all documented in [docs/AGENT_API.md](AGENT_API.md):

- `GET /notes/{path}` returns the **whole** note when `limit` is omitted (the source truncated at 500
  lines), so existing clients that expect the full content keep working; paging is opt-in.
- `base_version` is **optional** by default (absent → last-writer-wins, as before) with
  `WEBOBSIDIAN_AGENT_REQUIRE_VERSION=1` for the source's strict behaviour. Turning it on by default
  would have broken every already-deployed agent, including this fork's own wiki tooling.
- `/note-matches` scans the file line by line instead of querying the search index: an agent grepping
  a note needs every literal occurrence, and the index can lag a write.

The remaining forks were surveyed and rejected: `picassio` (66 commits — a different central-vault
sync + release architecture), `latticelabs-au` (the big docs/comment translation, mostly cosmetic,
conflicts with everything), `CircuitBoardGames/webobsidian-GitPusher` and `hzxyayaya/USC-Wiki-Editor`
(different products: pre-auth vault picker / contribution review on a Worker deployment),
`AceDylan` + `omairaslam` (trusted-proxy and Cloudflare-Access auto-login — auth-critical, worth
re-implementing deliberately rather than importing), `vinhnghiemnguyen` (real-time collaboration —
out of upstream's single-user v1 scope), `quangtuandev` (R2 storage), `truongmanhsang` (themes/i18n
already merged via the PRs above). `jasongriebeler` independently found the same healthcheck bug this
fork fixed — corroboration for upstream [#30](https://github.com/xnohat/webobsidian/pull/30).

## Syncing a future upstream PR

```bash
scripts/upstream-pr-status.sh              # every open upstream PR: merged here or new?
scripts/upstream-pr-status.sh --new-only   # just the new ones (exit 1 when any exist)
scripts/merge-upstream-pr.sh <n>           # fetch refs/pull/<n>/head from upstream and merge it
```

`merge-upstream-pr.sh` fetches `refs/pull/<n>/head` from upstream and merges it with the standard
provenance message. Use it the same way for later PRs — and if you re-merge something that is already
in `main`, git simply reports "Already up to date".

"Already merged" is decided by **ancestry** (`git merge-base --is-ancestor refs/remotes/upstream/pr/<n>
main`), so it stays correct whether the PR was merged here, merged upstream, or arrived through a
stacked branch.

The check runs by itself too: `.github/workflows/upstream-sync.yml` scans every Monday (plus manual
dispatch) and, **only when a genuinely new PR exists**, opens or updates one issue labelled
`upstream-sync` listing it with the sync command. Silence means everything open upstream is already in
this fork.
