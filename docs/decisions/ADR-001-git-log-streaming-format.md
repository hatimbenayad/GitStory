# ADR-001: Single-Pass Streaming `git log` Format

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** `FR-6`, `FR-7`, `FR-10`, `FR-11`, `FR-12`, Unit `U2`

## Context
`FR-6` asks for a single streaming `git log` command producing commit metadata, file status (`A/M/D/R/C`), rename/copy source paths, and line additions/deletions (`--numstat`) while safely handling spaces, quotes, tabs, and Unicode in filenames. Passing `--name-status` and `--numstat` together causes Git to emit only the last diff format specified.

## Decision
Use a single streaming command combining `--raw --numstat -z`:

```
git -c core.quotepath=false log --reverse --date-order -M -C --use-mailmap --raw --numstat -z \
  --format=%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%s%x1e
```

- When `firstParent: true` (default), also pass `--first-parent -m` so merge commits on mainline emit their net diff relative to the first parent rather than appearing empty.
- Use `%aN` and `%aE` with `--use-mailmap` so Git natively applies `.mailmap`, plus a fallback in-process `.mailmap` parser for synthetic/unit test inputs.
- Parse the stdout stream incrementally by NUL (`\x00`) tokens and record separators (`\x1e` / `\x1f`), never buffering the entire log in memory.
- Merge `--raw` entries (status `A/M/D/R<score>/C<score>` + old/new paths) with `--numstat` entries (added/deleted lines, mapping `-` for binary files to `add: 0, del: 0`).

## Consequences
- Zero filename quoting bugs (handles spaces, quotes, Unicode, tabs, newlines in commit subjects).
- Single Git subprocess invocation, O(1) memory per commit.
- Requires pairing `--raw` and `--numstat` entries per commit inside the streaming state machine.
