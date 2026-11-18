# Tasks: U11 — Large-Repo Strategy (Sampling, Aggregation & Caps)

- [ ] T11.1 Write failing unit tests for `aggregateHistory` (day/week bucketing, tag preservation, change coalescing) and `collapseRepoState` (depth collapsing, strict `maxNodes` bound) (`packages/core/test/large-repo.test.ts`)
- [ ] T11.2 Implement `packages/core/src/large-repo.ts` and export from `@gitstory/core`
- [ ] T11.3 Wire Large-Repo controls & auto-activation badge into `apps/web`
- [ ] T11.4 Add `scripts/benchmark.mjs` and run against 5k and 10k synthetic commits; record results in `docs/progress.md`
- [ ] T11.5 Verify lint, typecheck, tests, build and commit Bolt U11
