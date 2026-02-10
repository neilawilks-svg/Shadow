# Git Worktrees

This repo includes a helper for parallel streams of work.

## Create worktrees

```bash
./scripts/setup-worktrees.sh
```

This creates:
- `../worktrees/opeani-shadow-board-agents/api-hardening` on `codex/api-hardening`
- `../worktrees/opeani-shadow-board-agents/ui-polish` on `codex/ui-polish`

Both worktrees branch from `codex/mainline`.
