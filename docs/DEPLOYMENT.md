# Deployment — this fork on LXC 107

> Historical deployment example from `phamtruonghung/webobsidian`.
> These host-specific commands do not describe an upstream-managed installation.

How the fork is deployed, what the CI/CD path does, and the runbook for a human. Written for the
actual production host (LXC 107 on the Proxmox node, `192.168.1.22`), but nothing here is specific to
it except the paths.

## Where it runs

| Piece | Value |
|-------|-------|
| Host | Proxmox LXC **107**, x86_64, Docker 29.x (no Node on the host — docker-only deployment) |
| Deploy checkout | `/root/webobsidian` — a clone of **this fork**, `main` |
| Compose project | `webobsidian` (set explicitly, so the volume name never depends on the directory) |
| Stack | `docker-compose.yml` → container `webobsidian`, image `webobsidian:latest`, `0.0.0.0:8787` |
| Vault | host bind `/root/obsidian-data` → `/vault` — **never touched by a deploy** |
| App data | named volume `webobsidian_webobsidian-data` → `/data` (`settings.json`, `uistate.json`, `qmd-index.json`) |
| Env | `/root/webobsidian/.env` (git-ignored; the only place deploy parameters and the operator password live) |
| Backups | `/root/backups/webobsidian-backup/` — one rolling backup, replaced each deploy |
| Rollback image | `webobsidian:rollback` (the previous good image) |
| Public URL | `https://webobsidian.digitalciapp.com` via the cloudflared tunnel on the Proxmox host |
| CI/CD runner | self-hosted GitHub Actions runner in the LXC, labels `self-hosted`, `webobsidian-107` |

The vault is a bind mount, so an upgrade cannot move, copy or lose notes. Only `/data` is snapshotted,
and `settings.json` in that volume survives deploys because the volume (and its name) is reused.

## Deploy path

`.github/workflows/deploy.yml` runs on a **self-hosted runner inside LXC 107** — the container is
behind NAT, so no GitHub-hosted runner can reach it and no inbound port is opened. It triggers:

1. automatically, after the **CI** workflow completes successfully for a **push to `main`** (i.e. a
   merged PR). `workflow_run.event == 'push'` is checked explicitly, because `workflow_run` also fires
   for `pull_request` runs and a fork PR must never reach the deploy runner;
2. manually via **Actions → Deploy (LXC 107) → Run workflow**.

The job pins the deploy checkout to the exact merged commit, then runs `deploy/deploy.sh`:

```
sync checkout → rolling backup → tag current image as webobsidian:rollback
              → docker compose build → up -d → wait for healthy → deploy/smoke.sh
              → on any failure: retag rollback image, up -d, exit non-zero
```

`concurrency: deploy-lxc107` (no cancel) means deploys queue instead of overlapping.

## Which version is running, and how to verify it

`GET /healthz` answers it directly (no auth), from inside the host or from the public URL:

```bash
curl -s http://127.0.0.1:8787/healthz          # on the LXC
curl -s https://webobsidian.digitalciapp.com/healthz
# {"ok":true,"version":"0.1.1","build":"8e92d25"}
```

- `version` — the repo version (`package.json`, not the server workspace's own counter).
- `build` — the git commit the image was built from; `dev` means the image was built outside
  `deploy/deploy.sh` (e.g. a plain `docker compose build`).

The deploy pipeline bakes that commit in (`--build-arg GIT_SHA=…`), verifies the running container
actually is the freshly built image (`ensure_running_image`, which forces a recreate when Compose left
the old container up), and the smoke test asserts `build` equals the deployed commit — so a deploy that
did not really restart the service fails instead of passing silently.

Other ways to check, in decreasing order of directness:

```bash
# what the pipeline recorded
ssh root@192.168.1.22 'pct exec 107 -- git -C /root/webobsidian log -1 --pretty="%h %cs %s"'
ssh root@192.168.1.22 'pct exec 107 -- docker inspect webobsidian --format "{{.Config.Image}} {{.Image}} {{.State.Health.Status}} {{.State.StartedAt}}"'
ssh root@192.168.1.22 'pct exec 107 -- docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}"'
# the two images must match; the container must run the id of webobsidian:latest

# what GitHub Actions did (triggered by the merge that deployed it)
gh run list --repo phamtruonghung/webobsidian --workflow "Deploy (LXC 107)" --limit 3
gh run view <run-id> --log | grep 'deploy OK'

# is the fork ahead/behind the deployed commit?
git fetch origin && git log --oneline -1 origin/main
```

Browser-visible markers of this fork (vs upstream `v0.1.1`), no shell needed:

- `https://webobsidian.digitalciapp.com/auth/status` → `{"passwordSet":true}`. Upstream also returned
  `mustChangePassword` on that unauthenticated route; its absence means PR #15 is running.
- Settings → **Appearance** offers the Catppuccin flavours (PR #11).
- Opening notes reuses one italic **preview tab**; double-click its title to keep it (PR #29).
- The graph view supports touch pan/pinch and node dragging (PR #25).

## ⚠️ Vault git sync — never point it at this repository

The app's **Settings → GitHub Sync** writes a `git` block into the app data
(`settings.json`: remote/branch/autoSync/intervalSec/token). If that remote is *this source
repository*, the sync clones/pulls the source tree **into the vault**: `CHANGELOG.md`,
`IMPLEMENTATION_PLAN.md`, `PRD.md`, `server/`, `web/`, `docs/`, `.git` and friends show up as
"notes" at `/note/CHANGELOG.md`, and the app keeps re-pulling them every `intervalSec`.

That happened here (see issue #17): 28 top-level repo entries plus a `.git` in `/vault`, 16 MB of
source tree served as notes. Recovery was: disable the sync + clear the remote, move the repo
entries and `.git` out of the vault (not delete), restore the note folders found in `.trash`, and
restart. Root entries went 35 → 7 and the vault 16 MB → 596 KB.

Rules:

- **Never** configure this repository (or any WebObsidian checkout) as the vault git remote.
- Want vault versioning? Use a **dedicated notes-only repository**, and keep `.trash/` and
  `sample-vault/` out of it.
- **Never** store a push token for a repository you do not want your notes published to. Here the
  push failed for lack of a token, which is the only reason no note ever left the host.
- Check it in one command:

```bash
# what the app's sync is pointed at (and whether it is on)
pct exec 107 -- bash -lc 'python3 -c "import json;print(json.load(open(\"/var/lib/docker/volumes/webobsidian_webobsidian-data/_data/settings.json\"))[\"git\"])"'
# what is actually in the vault — anything in this list that is also in the repo top level is wrong
pct exec 107 -- bash -lc 'ls -A /root/obsidian-data'
```

## Runbook

```bash
ssh root@192.168.1.22 'pct exec 107 -- bash -lc "cd /root/webobsidian && deploy/deploy.sh"'
```

| Want | Command |
|------|---------|
| Deploy current `main` | `deploy/deploy.sh` (syncs to `origin/main`, rebuilds, smoke-tests) |
| Deploy a specific commit | `git -C /root/webobsidian checkout --force <sha> && SYNC=0 deploy/deploy.sh` |
| Adopt/replace the checkout | `GIT_REMOTE_URL=https://github.com/phamtruonghung/webobsidian.git deploy/deploy.sh --bootstrap` |
| Back up only | `deploy/deploy.sh --backup-only` |
| Roll back the image | `deploy/deploy.sh --rollback` |
| Tail the app | `docker compose -f /root/webobsidian/docker-compose.yml -p webobsidian logs -f webobsidian` |
| Health | `docker inspect -f '{{.State.Health.Status}}' webobsidian` |

`deploy/smoke.sh [url]` can be run on its own against any running deployment; it asserts the fork's
behaviour (`/healthz`, the SPA bundle, `/auth/status` exposing **only** `passwordSet`, `123456`
refused once a credential is configured, the operator password logging in) and is what the deploy job
gates on. It never prints a secret.

### Daily note — which folder the ribbon button writes to

The **Daily note** button (ribbon icon, or *Open today's daily note* in the command palette) resolves
the date in this order:

1. an existing note **anywhere** in the vault whose name is the date (`api.resolve(iso)`) is opened as-is;
2. otherwise the note is created in the **first `daily/` folder found in the tree**, choosing the
   shallowest path when there is more than one (e.g. `relats/daily/`);
3. only if the vault has no `daily/` folder at all does it fall back to the conventional root `Daily/`.

Step 2 exists because a vault whose daily notes are filed by an agent is read from a fixed path: the
filing run in this deployment reads `relats/daily/<date>.md` nightly, so a note created at the root
fallback would sit there unseen and never be filed. Before 2026-09-26 the folder was hard-coded to
`Daily/` and only the `resolve` step hid the problem on weekdays (the Sunday prep run creates
`relats/daily/` pages for Mon–Fri, so those dates resolved; Saturdays and Sundays did not, and the
note landed in the wrong place). If a future vault wants a different folder, give it a real setting
rather than re-hard-coding a path here.

```bash
# which folder did the button use? the note it created is the newest file under any daily/ folder
ssh root@192.168.1.22 'pct exec 107 -- find /root/obsidian-data -maxdepth 3 -type d -iname daily'
```

## Backups and rollback

- **Backup** (`--backup-only`, also run automatically before every deploy): `/data` volume tarball,
  a **manifest** of the vault (path, file count, byte count, sorted file list), a copy of `.env`, and
  the git state (origin, HEAD, `git status`, uncommitted diff) of the directory being replaced.
  Default `BACKUP_KEEP=1` — one rolling backup, replaced each time.
- **Image rollback**: the previous image is retagged as `webobsidian:rollback` before each build, so
  `deploy/deploy.sh --rollback` brings the last good build back in seconds. A failed smoke test
  triggers that automatically.
- **What rollback does *not* cover**: it reverts the **image**, not configuration. If `.env` itself is
  wrong (e.g. `WEBOBSIDIAN_PASSWORD` drift), the rolled-back container still reads the same `.env`, so
  the deploy fails, exits non-zero, and leaves the previous build live but with the drifted config —
  fix `.env` and run the deploy again. Rehearsed locally: a shell `WEBOBSIDIAN_PASSWORD` overriding
  `.env` made smoke fail with `401`, and the script retagged the previous image, recreated the
  container, reported `smoke test failed — rolled back` and exited `1`.
- **Data restore**: the vault is a bind mount and is never modified; to restore `/data`, extract
  `data-<ts>.tar.gz` into `/var/lib/docker/volumes/webobsidian_webobsidian-data/_data` with the stack
  stopped (`tar -x -z -f data-<ts>.tar.gz -C <that dir>`; dash-prefixed flags so a host tar wrapper
  can't mangle them).

## One-time host setup (already done, kept for rebuilds)

1. `docker` + compose plugin installed in the LXC (Ubuntu 24.04).
2. Runner: download `actions/runner` into `/root/actions-runner`, register with a repo registration
   token (`gh api -X POST repos/phamtruonghung/webobsidian/actions/runners/registration-token -f ...`),
   labels `self-hosted,webobsidian-107`, then `./svc.sh install && ./svc.sh start`.
   The runner runs as root, which is what lets the job drive Docker.
3. `/root/webobsidian/.env` — `VAULT_HOST_PATH=/root/obsidian-data`, `HTTP_BIND=0.0.0.0`,
   `HTTP_PORT=8787`, `TRUST_PROXY=true`, `WEBOBSIDIAN_PASSWORD=<operator override>`,
   `WEBOBSIDIAN_WATCH=auto`, `CLIENT_IP_HEADER=CF-Connecting-IP` (per-visitor login throttle
   behind the tunnel — without it every visitor shares cloudflared's address and 10 wrong
   guesses from anyone lock the owner out for 15 min; ideally also narrow `TRUST_PROXY` to the
   Proxmox host's IP since `HTTP_BIND=0.0.0.0` makes the port reachable on the LAN).

### Migration off the upstream checkout (2026-09-20)

LXC 107 originally ran a clone of `xnohat/webobsidian` with a host-local
`docker-compose.override.yml` patching an upstream healthcheck bug (`localhost` → `::1` inside the
container while the server binds IPv4 only, so the probe failed forever and the container reported
unhealthy while serving fine). Both the checkout and that workaround are gone:

- the IPv4 healthcheck is fixed in the fork's `docker-compose.yml` **and** `Dockerfile`;
- `deploy/deploy.sh --bootstrap` backed up `.env`, the git state and `/data`, replaced the directory
  with a clone of this fork, restored `.env`, dropped the override, kept the upstream image as
  `webobsidian:rollback`, and deployed;
- the same vault path and the same named volume were reused, so no data was copied and none was lost.

**Evidence from the run (2026-09-20T04:50Z, bootstrap → fork build `7afbc2c`):**

| Check | Before | After |
|-------|--------|-------|
| vault files / manifest md5 | 80 / `de1ade2a…` | 80 / `de1ade2a…` (identical) |
| `/data` `settings.json` md5 | `96c3e91d…` | `96c3e91d…` (identical) |
| `/data` `uistate.json` md5 | `36028a5d…` | `36028a5d…` (identical) |
| `auth` state | userPasswordHash set, jwtSecret 96 | unchanged |
| `GET /auth/status` | `{"passwordSet":true,"mustChangePassword":false}` (upstream) | `{"passwordSet":true}` (fork) |
| operator password login | 200 | 200 |
| `123456` login | 401 | 401 |
| container health | healthy | healthy |
| public URL `/healthz` + `/auth/status` | served | served, fork build |

18/18 post-migration checks passed (`/root/backups/webobsidian-backup/` holds the pre-migration
`data-*.tar.gz`, `env-*`, `vault-manifest-*` and `git-state-*`). Note the rollback slot follows the
north star of one previous image: after the first CI deploy it holds the previous **fork** image, not
the upstream build — the upstream build is reproducible from `xnohat/webobsidian` if it were ever
needed.

The first **automatic** deploy then ran on its own: merging the deployment PR (#5) → CI on `main`
green → `Deploy (LXC 107)` started on the self-hosted runner, synced the checkout to the merged commit
`278f617`, took the rolling backup, kept the previous image as `webobsidian:rollback`, rebuilt, waited
for `healthy`, passed all 5 smoke checks and logged `deploy OK: 278f617 is live`.

### App test pages

Click-through pages used to exercise the running app live **in the vault**, not the repo, so the
production wiki and its lint stay untouched:

- `Testing/webobsidian-fork-build.md` — what this build is, what's new, and a feature checklist
  (preview tabs, themes, graph touch, English Account tab, rendering fixes).
- `Testing/round-trip.md` — create/read/append check against the Agent API.

The operator-facing version of these notes (upgrade caveats, verification commands) is in the
repository README: [`§ Community integration`](../README.md#-community-integration).

## Optional remote MCP

For generic HTTPS proxy and MCP configuration, see [MCP_REMOTE.md](MCP_REMOTE.md).
