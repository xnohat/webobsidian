#!/usr/bin/env bash
# Report which open upstream pull requests are already in this fork, and which are new.
#
#   scripts/upstream-pr-status.sh              full table (every open upstream PR)
#   scripts/upstream-pr-status.sh --new-only   only the new ones; exit 1 when any exist
#
# "Merged" is decided by ancestry, not by a message pattern: the PR's head commit
# (fetched as refs/remotes/upstream/pr/<n>) is an ancestor of this repo's main branch.
# That covers PRs we merged ourselves, PRs upstream merged, and PRs whose content arrived
# through a stacked branch. A PR opened *from this fork* is reported as "ours" rather than
# "new": it is our own offer upstream, so it must neither count as work to sync nor nag the
# weekly check forever. Exit 2 means the listing could not be produced at all, so an empty
# report is never mistaken for "everything is up to date".
set -uo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-xnohat/webobsidian}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/xnohat/webobsidian.git}"
# Default to the *remote-tracking* branch: on the deploy host the checkout is a detached
# HEAD (the CI checkout of the deployed SHA) and a local `main` there is stale, which made
# every merged PR look new. origin/main is right in both a working clone and a CI checkout.
BRANCH="${BRANCH:-origin/main}"
NEW_ONLY=0
[[ "${1:-}" == "--new-only" ]] && NEW_ONLY=1

REPO_DIR="$(git rev-parse --show-toplevel)"
cd "$REPO_DIR"

# Resolve the comparison ref: the requested one, else the remote-tracking main, else the
# local main, else HEAD. A missing ref must never silently compare against nothing.
if ! git rev-parse --verify --quiet "$BRANCH" >/dev/null; then
  for cand in origin/main main HEAD; do
    if git rev-parse --verify --quiet "$cand" >/dev/null; then
      echo "warning: ref '$BRANCH' not found here, comparing against '$cand'" >&2
      BRANCH="$cand"; break
    fi
  done
fi
git rev-parse --verify --quiet "$BRANCH" >/dev/null || { echo "ERROR: no ref to compare against" >&2; exit 2; }

# The fork's own owner, so PRs opened from this fork can be told apart from third-party work.
if [[ -z "${FORK_OWNER:-}" ]]; then
  FORK_OWNER="$(git remote get-url origin 2>/dev/null \
    | sed -E 's#(git@|https://)[^:/]+[:/]([^/]+)/.*#\2#' || true)"
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
echo "fetching upstream pull refs…" >&2
git fetch --quiet upstream '+refs/pull/*/head:refs/remotes/upstream/pr/*' 2>/dev/null || \
  echo "warning: could not refresh upstream pull refs (using the ones already fetched)" >&2

# Open PRs as tab-separated "<number>\t<created YYYY-MM-DD>\t@<author>\t<head owner>\t<title>",
# via the gh CLI when available and the public REST API (curl + python3) otherwise — the deploy
# host has no gh. Non-zero when no listing could be produced.
list_open_prs() {
  if command -v gh >/dev/null 2>&1; then
    gh pr list --repo "$UPSTREAM_REPO" --state open --limit 200 \
      --json number,title,author,createdAt,headRepositoryOwner \
      --jq '.[] | "\(.number)\t\(.createdAt[0:10])\t@\(.author.login)\t\(.headRepositoryOwner.login // "unknown")\t\(.title)"' \
      && return 0
    echo "warning: gh pr list failed, falling back to the REST API" >&2
  fi
  local auth=()
  if [[ -n "${GITHUB_TOKEN:-}${GH_TOKEN:-}" ]]; then
    auth=(-H "Authorization: Bearer ${GITHUB_TOKEN:-${GH_TOKEN}}")
  fi
  curl -fsS -m 30 "${auth[@]}" -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$UPSTREAM_REPO/pulls?state=open&per_page=100&sort=created&direction=asc" \
    | python3 -c '
import json, sys
for pr in json.load(sys.stdin):
    head = (pr.get("head") or {}).get("repo") or {}
    owner = (head.get("owner") or {}).get("login") or "unknown"
    fields = [pr["number"], pr["created_at"][:10], "@" + pr["user"]["login"], owner, pr["title"]]
    print(*fields, sep="\t")
' 2>/dev/null
}

prs_file="$(mktemp)"
if ! list_open_prs > "$prs_file"; then
  echo "ERROR: could not list open upstream PRs (no working gh, and the REST fallback failed)" >&2
  rm -f "$prs_file"; exit 2
fi
mapfile -t PRS < <(sort -n "$prs_file")
rm -f "$prs_file"
[[ ${#PRS[@]} -gt 0 ]] || { echo "no open upstream PRs"; exit 0; }

new_count=0
ours_count=0
[[ $NEW_ONLY -eq 0 ]] && printf '%-6s %-11s %-16s %s\n' "PR" "CREATED" "AUTHOR" "STATUS → TITLE"
while IFS=$'\t' read -r n created author head_owner title; do
  [[ -n "${n:-}" ]] || continue
  ref="refs/remotes/upstream/pr/$n"

  if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
    status="UNKNOWN (ref not fetched)"
  elif git merge-base --is-ancestor "$ref" "$BRANCH" 2>/dev/null; then
    merge_commit="$(git log --merges --grep="upstream PR #$n:" -1 --pretty=%h "$BRANCH" 2>/dev/null)"
    status="merged${merge_commit:+ ($merge_commit)}"
  elif [[ -n "$FORK_OWNER" && "$head_owner" == "$FORK_OWNER" ]]; then
    status="ours (offered upstream)"; ours_count=$((ours_count + 1))
  else
    status="NEW"; new_count=$((new_count + 1))
  fi

  if [[ $NEW_ONLY -eq 1 ]]; then
    [[ "$status" == "NEW" ]] && printf '%s\t%s\t%s\t%s\n' "$n" "$author" "$title" \
      "https://github.com/$UPSTREAM_REPO/pull/$n"
  else
    printf '%-6s %-11s %-16s %s → %s\n' "#$n" "$created" "$author" "$status" "$title"
  fi
done < <(printf '%s\n' "${PRS[@]}")

if [[ $NEW_ONLY -eq 1 ]]; then
  echo "new upstream PRs: $new_count" >&2
  [[ $new_count -gt 0 ]] && exit 1
  exit 0
fi
echo
echo "open upstream PRs: ${#PRS[@]} | not yet in $BRANCH: $new_count | ours upstream: $ours_count"
if [[ $new_count -gt 0 ]]; then
  echo "sync one with: scripts/merge-upstream-pr.sh <pr-number>  (then verify with npm ci && npm test && npm run build)"
else
  echo "this fork is up to date with every open upstream PR."
fi
