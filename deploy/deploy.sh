#!/usr/bin/env bash
# Idempotent deploy of this fork as the Docker Compose stack.
#
#   deploy/deploy.sh                 deploy the current checkout (backup → build → up → smoke)
#   deploy/deploy.sh --bootstrap     adopt/replace an existing deploy dir with a fresh clone first
#   deploy/deploy.sh --rollback      re-tag the previous image and bring it back up
#   deploy/deploy.sh --backup-only   take the rolling backup and exit
#
# Used by .github/workflows/deploy.yml (self-hosted runner on the target host) and by hand on the
# host. Everything is idempotent: running it twice in a row is a no-op rebuild.
#
# Configuration (env vars, all optional):
#   DEPLOY_DIR    checkout to deploy from                (default: /root/webobsidian)
#   ENV_FILE      compose env file                       (default: $DEPLOY_DIR/.env)
#   BRANCH        branch to sync when SYNC=1             (default: main)
#   SYNC          1 = git fetch + hard checkout the branch tip; 0 = deploy the tree as-is
#   PROJECT       compose project name (= volume prefix) (default: webobsidian)
#   IMAGE         image tag to build/run                 (default: webobsidian:latest)
#   ROLLBACK_IMAGE tag holding the previous good image   (default: webobsidian:rollback)
#   BACKUP_DIR    rolling backup location                (default: /root/backups)
#   BACKUP_KEEP   how many backups to keep               (default: 1 — one rolling backup)
#   HEALTH_TIMEOUT seconds to wait for container health  (default: 240)
#   UNHEALTHY_GRACE seconds a container may report unhealthy before the deploy fails (default: 60)
#   GIT_REMOTE_URL clone URL used by --bootstrap         (default: this repo's origin)
#   PORT_WAIT_URL override the local URL probed by smoke (default: http://127.0.0.1:$HTTP_PORT)
#   TAR_BIN       tar binary to use (default: tar — override if the host wraps tar)
#
# The vault (a host bind mount) is never modified by a deploy: only /data (settings.json, uistate,
# index) is snapshotted, and the previous image is kept as $ROLLBACK_IMAGE so a bad build can be
# reverted in seconds.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEPLOY_DIR="${DEPLOY_DIR:-/root/webobsidian}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
BRANCH="${BRANCH:-main}"
SYNC="${SYNC:-1}"
PROJECT="${PROJECT:-webobsidian}"
IMAGE="${IMAGE:-webobsidian:latest}"
ROLLBACK_IMAGE="${ROLLBACK_IMAGE:-webobsidian:rollback}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-240}"
UNHEALTHY_GRACE="${UNHEALTHY_GRACE:-60}"
TAR_BIN="${TAR_BIN:-tar}"
GIT_REMOTE_URL="${GIT_REMOTE_URL:-$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)}"

MODE="deploy"
case "${1:-}" in
  --bootstrap) MODE="bootstrap" ;;
  --rollback) MODE="rollback" ;;
  --backup-only) MODE="backup" ;;
  -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "") ;;
  *) echo "unknown argument: $1 (try --help)" >&2; exit 64 ;;
esac

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

env_get() { # env_get KEY  -> value from ENV_FILE (empty when unset)
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -1 | sed 's/^["'"'"']//; s/["'"'"']$//'
}

compose() { WO_IMAGE="$IMAGE" docker compose -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }

# ── backup ───────────────────────────────────────────────────────────────────────────────────────
# One rolling backup (BACKUP_KEEP=1 by default, keep-it-lean): the /data volume contents, a manifest
# of the vault (file list + count, so a restore can be verified), the .env that configures the stack,
# and the git state of the directory being replaced. The vault itself is a host bind and is NOT
# copied — for a full vault copy, tar $VAULT_HOST_PATH separately.
BACKUP_TS=""
backup() {
  local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_TS="$ts"
  local out="$BACKUP_DIR/webobsidian-backup"
  local vault_host data_vol

  vault_host="$(env_get VAULT_HOST_PATH)"
  [[ -n "$vault_host" ]] || vault_host="./sample-vault"
  [[ "$vault_host" = /* ]] || vault_host="$DEPLOY_DIR/${vault_host#./}"
  data_vol="/var/lib/docker/volumes/${PROJECT}_webobsidian-data/_data"

  log "backup → $out/{data-$ts.tar.gz,vault-manifest-$ts.txt,env-$ts}"
  rm -rf "$out"; mkdir -p "$out"

  if [[ -d "$data_vol" ]]; then
    # Dash-prefixed flags on purpose: some hosts wrap tar (e.g. a shim that inserts
    # --no-same-owner), and `tar czf …` breaks through such a wrapper.
    "$TAR_BIN" -c -z -f "$out/data-$ts.tar.gz" -C "$data_vol" . || die "could not archive $data_vol"
    log "  data: $("$TAR_BIN" -t -z -f "$out/data-$ts.tar.gz" | wc -l) entries"
  else
    log "  data: volume dir $data_vol not present yet (first deploy)"
  fi

  if [[ -d "$vault_host" ]]; then
    { printf '# vault: %s\n# files: %s\n# bytes: %s\n' "$vault_host" \
        "$(find "$vault_host" -type f | wc -l)" "$(du -sb "$vault_host" | cut -f1)"
      (cd "$vault_host" && find . -type f | LC_ALL=C sort); } > "$out/vault-manifest-$ts.txt"
    log "  vault: $(grep -c '^\./' "$out/vault-manifest-$ts.txt") files listed (bind mount, not copied)"
  else
    log "  vault: host path $vault_host does not exist yet"
  fi

  [[ -f "$ENV_FILE" ]] && cp -p "$ENV_FILE" "$out/env-$ts" && log "  env: saved ($(grep -cE '^[A-Za-z_]+=' "$ENV_FILE") keys)"

  if git -C "$DEPLOY_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    { printf 'dir: %s\norigin: %s\nHEAD: %s\n' "$DEPLOY_DIR" \
        "$(git -C "$DEPLOY_DIR" remote get-url origin 2>/dev/null || echo none)" \
        "$(git -C "$DEPLOY_DIR" rev-parse HEAD)"
      printf '\n# git status --porcelain\n'; git -C "$DEPLOY_DIR" status --porcelain
      printf '\n# uncommitted diff\n'; git -C "$DEPLOY_DIR" diff; } > "$out/git-state-$ts.txt"
    log "  git state of $DEPLOY_DIR recorded in git-state-$ts.txt"
  fi

  # keep only the newest BACKUP_KEEP backups
  local -a olds
  mapfile -t olds < <(ls -1dt "$BACKUP_DIR"/webobsidian-* 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)))
  ((${#olds[@]})) && rm -rf "${olds[@]}" && log "  pruned $(( ${#olds[@]} )) older backup(s)"
  return 0
}

# ── steps ────────────────────────────────────────────────────────────────────────────────────────
ensure_env_file() {
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found — cp .env.example .env in $DEPLOY_DIR and edit it"
}

sync_checkout() {
  [[ "$SYNC" == "1" ]] || { log "sync skipped (SYNC=0): deploying $DEPLOY_DIR as-is"; return 0; }
  git -C "$DEPLOY_DIR" rev-parse --git-dir >/dev/null 2>&1 || die "$DEPLOY_DIR is not a git checkout"
  log "syncing $DEPLOY_DIR to origin/$BRANCH"
  git -C "$DEPLOY_DIR" fetch --prune origin
  # --force: build artifacts and lockfile drift must never block a deploy; untracked files (.env) survive.
  git -C "$DEPLOY_DIR" checkout --force "$BRANCH"
  git -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH" >/dev/null
  log "  HEAD now $(git -C "$DEPLOY_DIR" rev-parse --short HEAD) — $(git -C "$DEPLOY_DIR" log -1 --pretty=%s)"
}

keep_rollback_image() {
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    docker tag "$IMAGE" "$ROLLBACK_IMAGE"
    log "current $IMAGE kept as $ROLLBACK_IMAGE"
  else
    log "no existing $IMAGE to keep as $ROLLBACK_IMAGE (first deploy here)"
  fi
}

bootstrap() {
  log "bootstrap: adopting $DEPLOY_DIR as a checkout of $GIT_REMOTE_URL"
  [[ -n "$GIT_REMOTE_URL" ]] || die "GIT_REMOTE_URL is empty and $REPO_DIR has no origin remote"
  backup
  mkdir -p "$DEPLOY_DIR"
  local env_saved=""
  [[ -f "$ENV_FILE" ]] && env_saved="$BACKUP_DIR/webobsidian-backup/env-$BACKUP_TS"

  if [[ -d "$DEPLOY_DIR/.git" ]]; then
    local current; current="$(git -C "$DEPLOY_DIR" remote get-url origin 2>/dev/null || echo none)"
    log "  existing checkout origin: $current"
  fi
  log "  removing $DEPLOY_DIR (env + git state already backed up)"
  rm -rf "$DEPLOY_DIR"
  git clone --branch "$BRANCH" "$GIT_REMOTE_URL" "$DEPLOY_DIR"
  if [[ -n "$env_saved" && -f "$env_saved" ]]; then
    cp -p "$env_saved" "$ENV_FILE"; log "  restored .env from backup"
  fi
  if [[ -f "$DEPLOY_DIR/docker-compose.override.yml" ]]; then
    rm -f "$DEPLOY_DIR/docker-compose.override.yml"
    log "  dropped docker-compose.override.yml (its IPv4 healthcheck fix now lives in docker-compose.yml)"
  fi
}

build_and_up() {
  local sha
  sha="$(git -C "$DEPLOY_DIR" rev-parse --short HEAD 2>/dev/null || echo dev)"
  log "building $IMAGE (GIT_SHA=$sha)"
  compose build --build-arg "GIT_SHA=$sha"
  log "starting stack (project $PROJECT)"
  compose up -d --remove-orphans
}

# A deploy that rebuilds the image but leaves the old container running is a silent no-op:
# `docker compose up -d` does not always recreate when only the image content changed, and
# the smoke test cannot tell (the previous container answers the same endpoints). So compare
# what is running against what was just built and force a recreate when they differ.
ensure_running_image() {
  local want have cid
  want="$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
  cid="$(compose ps -q webobsidian 2>/dev/null || true)"
  [[ -n "$cid" ]] || die "no webobsidian container after 'up -d'"
  have="$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || echo none)"
  if [[ "$want" != "$have" ]]; then
    log "container runs ${have:0:19}… but $IMAGE is ${want:0:19}… — recreating to run the new build"
    compose up -d --force-recreate --remove-orphans
    cid="$(compose ps -q webobsidian)"
    have="$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || echo none)"
  fi
  [[ "$want" == "$have" ]] || die "container is not running the built image ($have != $want)"
  log "container runs $IMAGE (${want:0:19}…)"
}

wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) status="" unhealthy_since=0
  local cid; cid="$(compose ps -q webobsidian 2>/dev/null || true)"
  [[ -n "$cid" ]] || die "no webobsidian container after 'up -d'"
  while :; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    [[ "$status" == "healthy" ]] && { log "container healthy"; return 0; }
    [[ "$status" == "exited" || "$status" == "dead" ]] && { health_diag "$cid"; compose logs --tail 40 webobsidian || true; die "container $status"; }
    # "unhealthy" means probes ran and failed: the server is up but not answering, so
    # waiting out the full timeout only delays the rollback. Allow a grace window, then fail.
    if [[ "$status" == "unhealthy" ]]; then
      [[ "$unhealthy_since" == "0" ]] && unhealthy_since=$(date +%s)
      if (( $(date +%s) - unhealthy_since > UNHEALTHY_GRACE )); then
        health_diag "$cid"; compose logs --tail 40 webobsidian || true; return 1
      fi
    fi
    (( $(date +%s) > deadline )) && { health_diag "$cid"; compose logs --tail 40 webobsidian || true; return 1; }
    sleep 3
  done
}

health_diag() { # last healthcheck results, so a failed deploy explains itself
  log "health check log (last 5):"
  docker inspect -f '{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{end}}' "$1" 2>/dev/null \
    | tail -5 | sed 's/^/[deploy]   /' || true
}

rollback() {
  if ! docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
    die "no $ROLLBACK_IMAGE image to roll back to"
  fi
  log "rolling back: retagging $ROLLBACK_IMAGE → $IMAGE"
  docker tag "$ROLLBACK_IMAGE" "$IMAGE"
  compose up -d --force-recreate --remove-orphans
  wait_healthy || die "rollback image did not become healthy either — investigate $DEPLOY_DIR/docker-compose.yml"
  log "rollback complete (previous image is live again)"
}

smoke() {
  local port url build
  port="$(env_get HTTP_PORT)"; port="${port:-8787}"
  url="${SELF_URL:-http://127.0.0.1:$port}"
  build="$(git -C "$DEPLOY_DIR" rev-parse --short HEAD 2>/dev/null || true)"
  log "smoke test against $url${build:+ (expecting build $build)}"
  DEPLOY_DIR="$DEPLOY_DIR" ENV_FILE="$ENV_FILE" EXPECT_BUILD="$build" "$SCRIPT_DIR/smoke.sh" "$url"
}

# ── modes ────────────────────────────────────────────────────────────────────────────────────────
case "$MODE" in
  backup)
    backup ;;
  rollback)
    ensure_env_file; backup; rollback; smoke ;;
  bootstrap)
    bootstrap; ensure_env_file; keep_rollback_image; build_and_up; ensure_running_image
    wait_healthy || { rollback; die "new build unhealthy — rolled back"; }
    smoke || { rollback; die "smoke test failed — rolled back"; }
    log "bootstrap deploy OK ($(git -C "$DEPLOY_DIR" rev-parse --short HEAD))" ;;
  deploy)
    ensure_env_file
    sync_checkout
    backup
    keep_rollback_image
    build_and_up
    ensure_running_image
    wait_healthy || { rollback; die "new build unhealthy — rolled back"; }
    smoke || { rollback; die "smoke test failed — rolled back"; }
    log "deploy OK: $(git -C "$DEPLOY_DIR" rev-parse --short HEAD 2>/dev/null || echo "$DEPLOY_DIR") is live" ;;
esac
