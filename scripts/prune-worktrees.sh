#!/bin/sh
# Remove linked worktrees (and their local branches) whose PR has been merged.
# Skips the main worktree and any worktree with uncommitted changes.
# Run manually: git wt-prune. Also runs from the post-merge hook after `git pull`.
set -u

git fetch -p -q 2>/dev/null
main_wt=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
base=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)

git worktree list --porcelain | awk '/^worktree /{w=substr($0,10)} /^branch /{print w "\t" substr($0,19)}' |
while IFS="$(printf '\t')" read -r wt branch; do
  [ "$wt" = "$main_wt" ] && continue
  [ -n "$(git -C "$wt" status --porcelain)" ] && { echo "skip $branch (dirty)"; continue; }

  merged=0
  [ "$(git rev-list --count "$base..$branch")" = 0 ] && merged=1
  if [ "$merged" = 0 ] && command -v gh >/dev/null 2>&1; then
    [ -n "$(gh pr list --head "$branch" --state merged --json number -q '.[].number' 2>/dev/null)" ] && merged=1
  fi
  [ "$merged" = 1 ] || { echo "keep $branch (not merged)"; continue; }

  git worktree remove "$wt" 2>/dev/null || git worktree remove --force "$wt" && git branch -D "$branch" >/dev/null && echo "removed $branch"
done
git worktree prune
