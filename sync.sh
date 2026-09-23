#!/usr/bin/env bash
# Sync routine for parivar-pass <-> github.com/p-cult/parivar-pass
#
#   ./sync.sh pull   — fetch + fast-forward from origin/main (run before starting work)
#   ./sync.sh push   — stage, commit (if there are changes), and push to origin/main
#   ./sync.sh status — show where local stands vs origin
set -euo pipefail
cd "$(dirname "$0")"

cmd="${1:-status}"

case "$cmd" in
  pull)
    git fetch origin
    git pull --ff-only origin main
    ;;
  push)
    git add -A
    if ! git diff --cached --quiet; then
      msg="${2:-Update parivar-pass}"
      git commit -m "$msg"
    else
      echo "No changes to commit."
    fi
    git push origin main
    ;;
  status)
    git fetch origin
    git status
    echo
    git log --oneline origin/main..HEAD --decorate | sed 's/^/ahead: /'
    git log --oneline HEAD..origin/main --decorate | sed 's/^/behind: /'
    ;;
  *)
    echo "Usage: $0 {pull|push [commit message]|status}" >&2
    exit 1
    ;;
esac
