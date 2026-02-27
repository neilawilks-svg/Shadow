#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="${REPO_ROOT}/../worktrees/opeani-shadow-board-agents"

mkdir -p "${WORKTREE_ROOT}"

cd "${REPO_ROOT}"

if ! git rev-parse --verify codex/mainline >/dev/null 2>&1; then
  git branch codex/mainline
fi

if [ ! -d "${WORKTREE_ROOT}/api-hardening" ]; then
  git worktree add "${WORKTREE_ROOT}/api-hardening" -b codex/api-hardening codex/mainline
fi

if [ ! -d "${WORKTREE_ROOT}/ui-polish" ]; then
  git worktree add "${WORKTREE_ROOT}/ui-polish" -b codex/ui-polish codex/mainline
fi

echo "Worktrees created:"
git worktree list
