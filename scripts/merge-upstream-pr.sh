#!/usr/bin/env bash
# Merge an open PR from the upstream WebObsidian repo into this fork.
#
#   scripts/merge-upstream-pr.sh <pr-number> [branch]
#
# Fetches refs/pull/<n>/head from upstream (works for contributor forks without
# adding their remotes), then merges it with a provenance message. On conflict it
# stops and prints the conflicted files — resolve them by intent of both sides
# (docs in this repo are append-only logs: keep both entries), then `git add` the
# files and `git commit` to finish the merge. Never `git merge --abort`.
#
# See docs/UPSTREAM_PR_MERGES.md for the record of the PRs already merged here.
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/xnohat/webobsidian.git}"
UPSTREAM_REPO="${UPSTREAM_REPO:-xnohat/webobsidian}"

N="${1:-}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ -z "$N" || ! "$N" =~ ^[0-9]+$ ]]; then
  echo "usage: $0 <pr-number> [branch]" >&2
  exit 64
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch --quiet upstream "+refs/pull/${N}/head:refs/remotes/upstream/pr/${N}"

TITLE="$(gh pr view "$N" --repo "$UPSTREAM_REPO" --json title --jq .title 2>/dev/null || echo "PR #$N")"
AUTHOR="$(gh pr view "$N" --repo "$UPSTREAM_REPO" --json author --jq .author.login 2>/dev/null || echo unknown)"

echo "Merging upstream PR #$N — $TITLE (by @$AUTHOR) into $BRANCH"

git checkout --quiet "$BRANCH"
if git merge --no-ff --no-edit \
  -m "Merge upstream PR #$N: $TITLE" \
  -m "Upstream: ${UPSTREAM_REPO}#${N} (author @${AUTHOR})
Merged into the fork so the fix survives regardless of upstream status.
See docs/UPSTREAM_PR_MERGES.md." \
  "upstream/pr/${N}"; then
  echo "OK: PR #$N merged"
  exit 0
fi

CONFLICTS="$(git diff --name-only --diff-filter=U || true)"
if [[ -n "$CONFLICTS" ]]; then
  echo
  echo "Conflicts to resolve (both sides are usually additive — keep both):"
  echo "$CONFLICTS" | sed 's/^/  - /'
  echo
  echo "After editing: git add <files> && git commit   (do NOT git merge --abort)"
  exit 2
fi

echo "Merge failed for a reason other than conflicts." >&2
exit 1
