# Spec: U11 — Large-Repo Strategy (Sampling, Aggregation & Caps)

## 1. Purpose & Why
Repositories with 5,000–50,000+ commits or tens of thousands of files would overwhelm naive commit-by-commit replay and layout rendering. U11 implements automatic and user-configurable scaling (`FR-23`): aggregating dense commits into daily/weekly buckets, collapsing deep subdirectories, and capping visible nodes.

## 2. Functional Requirements Covered
- `FR-23`: Sampling/aggregation of commits into days or weeks, collapsing deep directories, configurable node cap.
- Performance criteria SC-4 (5k+ commits usable & responsive).

## 3. Data Contracts & Behavior
```ts
export type AggregationGranularity = 'commit' | 'day' | 'week';

export interface LargeRepoOptions {
  granularity: 'auto' | AggregationGranularity;
  maxDepth: number;         // default: 4 when active, Infinity when off
  maxNodes: number;         // default: 1500 (configurable up to 20000)
  autoThresholdEvents?: number; // default: 2000
}
```
- **Auto activation:** When `granularity === 'auto'`, commits `<= 2000` stay at `'commit'`, `2001..8000` aggregate by `'day'`, and `> 8000` aggregate by `'week'`.
- **Event Aggregation (`aggregateHistory`):** Merges commits within the same UTC day/week bucket while preserving tag boundaries (tags never merge across a bucket boundary silently; tag hash maps to the bucket's hash) and coalescing per-file changes accurately (`A` then `D` cancels out, `A` then `M` stays `A` with summed delta, etc.).
- **State Collapsing (`collapseRepoState`):** Collapses files deeper than `maxDepth` into summary directory nodes and enforces `maxNodes` by aggregating lowest-line tail files into directory summary nodes so rendered node count is strictly `<= maxNodes`.
- **UI Controls:** Visible "Large Repo Mode" badge + popover allowing granularity, max depth, and node cap adjustments live.
- **Benchmark Script (`scripts/benchmark.mjs`):** Benchmarks extraction/replay/layout on a 5,000- and 10,000-commit synthetic history and prints timings for recording in `docs/progress.md`.
