# Plan: U2 — Git Extractor & CLI `history.json` Output

## 1. Technical Approach
- Implement a pure streaming state-machine parser (`packages/extractor/src/stream-parser.ts`) that consumes chunks (`Buffer | string`) incrementally using a small residual buffer, never accumulating the full stdout string.
- Pair `--raw` entries and `--numstat` entries within each commit block (handling renames/copies where `--raw` emits `:oldmode newmode oldsha newsha R100\0oldPath\0newPath\0` and `--numstat` emits `add\tdel\t\0oldPath\0newPath\0`).
- Query repo metadata (`HEAD`, branch name) and tags (`git for-each-ref --format=... refs/tags`) via `execFile` (array args, zero shell injection).
- Build `apps/cli` with a lightweight zero-bloat arg parser (Node `util.parseArgs`), writing validated `history.json` and providing a built-in Node `http` server for `--serve` that serves `apps/web/dist` and `/api/history.json`.

## 2. Module Boundaries
- `packages/extractor/src/bot.ts`: Bot detection rules.
- `packages/extractor/src/mailmap.ts`: `.mailmap` parser & resolver (supplements Git's `--use-mailmap` for unit-testable in-memory resolution).
- `packages/extractor/src/stream-parser.ts`: Incremental NUL-delimited `--raw --numstat -z` parser.
- `packages/extractor/src/git-extractor.ts`: Spawns `git`, coordinates metadata, tags, streaming log, validates output with `@gitstory/core`.
- `apps/cli/src/cli.ts`: CLI entry point (`#!/usr/bin/env node`), `extract` and `serve` commands.

## 3. Risks & Mitigations
- **Merge commits with `-m --first-parent`:** Verify `--raw --numstat` output on merge commits with fixture tests (and deduplicate if a multi-parent commit ever repeats a record).
- **Windows path/encoding issues:** Force UTF-8 decoding and POSIX `/` path normalization via `@gitstory/core`.
