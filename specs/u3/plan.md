# Plan: U3 — State Replay Engine & Keyframes

## 1. Technical Approach
- Place the replay engine inside `packages/core/src/replay.ts` so `timeline`, `layout`, `web`, and workers can import it directly with zero extra packages.
- Maintain mutable working maps during sequential replay and create structural clones at keyframe indices (`0, N, 2N, ...`).
- Rebuild `dirs` tree metadata incrementally or via a fast linear directory-index pass on mutation so `DirNode.totalLines` and `fileCount` are always exact and empty directories are pruned immediately.

## 2. Module Boundaries
- `packages/core/src/replay.ts`: `ReplayEngine`, `createEmptyState()`, `applyCommitEvent()`, `cloneState()`.
- Exported from `packages/core/src/index.ts`.

## 3. Risks & Mitigations
- **Memory usage on large repos with dense keyframes:** Auto-scale default `keyframeInterval = Math.max(50, Math.ceil(events.length / 60))` when not explicitly passed, bounding stored keyframes to ≤ 60 snapshots regardless of repo size while keeping scrub latency < 5ms.
