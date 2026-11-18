# Plan: U4 — Timeline Engine (Virtual Clock, Adaptive Pacing & Scrubbing)

## 1. Technical Approach
- Create `packages/timeline` depending only on `@gitstory/core`.
- Precompute a `Float64Array` of cumulative event start times (`eventStarts[0..N]`) whenever mode, target duration, or highlights change.
- Use binary search (`upperBound`) to map any virtual timestamp `t` to `(eventIndex, eventProgress)` in O(log N) time with zero allocations per animation frame.

## 2. Module Boundaries (`packages/timeline/src/`)
- `pacing.ts`: `computeEventSchedule(events, options)` computing weights, cumulative timestamps, and auto target duration.
- `engine.ts`: `TimelineEngine` class (`play`, `pause`, `toggle`, `tick`, `seekToTime`, `seekToIndex`, `seekToProgress`, `nextChapter`, `prevChapter`, `jumpToChapter`, `setSpeed`, `setMode`, `sampleAtTime`, `subscribe`).
- `index.ts`: Public exports with TSDoc.

## 3. Risks & Mitigations
- **Mode switch jumps timeline position:** When switching between `adaptive` and `constant`, preserve the current `eventIndex` (re-anchoring `currentTimeSec` to the new schedule's start time for `eventIndex`) so playback never jumps backwards or forwards unexpectedly.
