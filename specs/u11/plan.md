# Plan: U11 — Large-Repo Strategy (Sampling, Aggregation & Caps)

## 1. Technical Approach
- Add `packages/core/src/large-repo.ts` implementing `resolveLargeRepoPolicy()`, `aggregateHistory()`, and `collapseRepoState()`.
- Wire `LargeRepoOptions` into `historyProcessor` / `history.worker.ts` and `useStoryStore` so large histories automatically activate aggregation and directory collapsing with live user overrides.
- Create `scripts/benchmark.ts` (runnable via `pnpm bench`) testing synthetic 5k and 10k commit histories through `ReplayEngine`, `detectHighlights`, `TimelineEngine`, and `StableTreeLayout`.
