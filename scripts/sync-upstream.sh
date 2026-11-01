#!/usr/bin/env bash
# Merges upstream Mailspring into a sync branch and resolves the conflicts that have a known
# answer. Anything else is left for review. See docs/upstream-sync.md.
set -euo pipefail

UPSTREAM_URL=https://github.com/Foundry376/Mailspring.git
UPSTREAM_REF=upstream/master
CLOUD_PATTERN='getmailspring\.com|IdentityStore|FeatureUsageStore|Sentry|@sentry/|mailspring-api-request'

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git config rerere.enabled true
git config rerere.autoupdate true
git config merge.conflictStyle zdiff3

git fetch upstream master

behind=$(git rev-list --count "HEAD..$UPSTREAM_REF")
if [ "$behind" -eq 0 ]; then
  echo "Already up to date with $UPSTREAM_REF."
  exit 0
fi
echo "Merging $behind upstream commits."

branch="sync/upstream-$(date +%Y-%m-%d)"
git switch -c "$branch"

if ! git merge --no-commit --no-ff "$UPSTREAM_REF"; then
  # Files the fork removed stay removed, but list them: upstream may have fixed a bug there
  # that also applies to code the fork kept.
  deleted_here=$(git status --porcelain | awk '$1 == "DU" { print $2 }')
  if [ -n "$deleted_here" ]; then
    echo
    echo "Kept deleted, changed upstream:"
    echo "$deleted_here" | sed 's/^/  /'
    echo "$deleted_here" | xargs git rm --quiet
  fi

  for lockfile in package-lock.json app/package-lock.json; do
    if git status --porcelain -- "$lockfile" | grep -q '^UU'; then
      git checkout --theirs -- "$lockfile"
      npm install --package-lock-only --ignore-scripts --prefix "$(dirname "$lockfile")"
      git add "$lockfile"
    fi
  done
fi

added_cloud_code=$(git diff --cached HEAD -- app/src app/internal_packages |
  grep -E "^\+.*($CLOUD_PATTERN)" || true)
if [ -n "$added_cloud_code" ]; then
  echo
  echo "Review before committing. Upstream added cloud-related code:"
  echo "$added_cloud_code" | cut -c1-120 | sed 's/^/  /'
fi

remaining=$(git diff --name-only --diff-filter=U)
echo
if [ -n "$remaining" ]; then
  echo "Resolve these by hand, then follow the remaining steps:"
  echo "$remaining" | sed 's/^/  /'
  echo
fi
echo "Next, on $branch:"
echo "  npm install && npm run typecheck && npm run lint:check && npm test"
echo "  git commit"
echo "  git switch master && git merge --ff-only $branch && git push origin master"
