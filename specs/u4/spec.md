# Spec: U4 — Timeline Engine (Virtual Clock, Adaptive Pacing & Scrubbing)

## 1. Purpose & Why
Raw commit timestamps contain awkward 3-month dead periods followed by bursts of 200 commits in one weekend. U4 provides a custom, framework-free virtual-clock timeline engine (`@gitstory/timeline`) that maps virtual playback time to event indices, implements documentary adaptive pacing (compressing dead gaps, slowing on highlights), supports constant-speed mode, chapter navigation, and deterministic stepping for video/GIF export.

## 2. Functional Requirements Covered
- `FR-20`: Play/pause, speed control, scrubbing, chapter jump.
- `FR-21`: Adaptive pacing (skip dead periods, slow down on highlights) + switch to constant speed.

## 3. Data Contracts (`@gitstory/timeline`)
```ts
export type PacingMode = 'adaptive' | 'constant';

export interface TimelineOptions {
  mode?: PacingMode;            // default: 'adaptive'
  targetDurationSec?: number;   // default: auto (15s–90s scaled by event count)
  speed?: number;               // default: 1 (range: 0.25–16)
  highlights?: Highlight[];
  chapters?: Chapter[];
}

export interface TimelineSnapshot {
  currentTimeSec: number;
  totalDurationSec: number;
  progress: number;             // 0..1
  eventIndex: number;           // -1 for empty, else 0..events.length-1
  eventProgress: number;        // 0..1 fractional progress within current event slot
  playing: boolean;
  speed: number;
  mode: PacingMode;
  activeChapter: Chapter | null;
  activeHighlight: Highlight | null;
}
```

## 4. Behavior & Pacing Algorithm
- **Event durations:** Each commit `i` receives a base duration weight:
  - In `constant` mode: every event has identical weight `1.0`.
  - In `adaptive` mode:
    - Base weight = `1.0` + `min(1.5, log2(1 + changes.length) * 0.25)` (larger commits linger slightly longer).
    - If commit `i` is a `Highlight`, multiply weight by `2.2` (up to `3.0` for release tags) so documentary beats breathe.
    - Inter-commit real-time gap `dt`: gaps > 7 days add a compressed pause beat (`min(0.6, log10(days) * 0.3)`), NEVER linear real-time dead air.
  - All weights are normalized so cumulative durations sum to `totalDurationSec`.
- **Binary Search Lookup:** `seekToTime(t)` locates `eventIndex` and `eventProgress` in O(log N) via cumulative start-time array.
- **Scrubbing & Chapters:** `seekToIndex(i)` sets `currentTimeSec` to event `i`'s start time. `jumpToChapter(index)` / `nextChapter()` / `prevChapter()` jump cleanly to tag chapter event indices.
- **Deterministic Export Stepping:** `sampleAtTime(t)` returns a pure `TimelineSnapshot` without mutating live playback state.
- **Edge Cases:** Empty repo (`events.length === 0`) or single-commit repo (`events.length === 1`) never divide by zero and produce valid snapshots (`progress: 0` or `1`).
