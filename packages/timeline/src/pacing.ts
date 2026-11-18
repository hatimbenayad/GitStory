import type { CommitEvent, Highlight } from '@gitstory/core';

export type PacingMode = 'adaptive' | 'constant';

export interface ScheduleOptions {
  mode?: PacingMode;
  targetDurationSec?: number;
  highlights?: readonly Highlight[];
}

export interface EventSchedule {
  /** Cumulative start time in seconds for each event (`length === events.length + 1`). */
  starts: Float64Array;
  /** Duration in seconds for each event (`length === events.length`). */
  durations: Float64Array;
  totalDurationSec: number;
}

const SEVEN_DAYS_SEC = 7 * 86400;

/**
 * Computes a sensible default documentary duration in seconds for a given commit count.
 */
export function computeAutoDurationSec(eventCount: number): number {
  if (eventCount <= 0) return 0;
  if (eventCount === 1) return 3;
  // ~0.45s per commit for small repos, smoothly bounded between 12s and 90s
  return Math.max(12, Math.min(90, Math.round(8 + Math.sqrt(eventCount) * 3.5)));
}

/**
 * Computes virtual-clock start times and durations for all commit events (`FR-21`).
 */
export function computeEventSchedule(
  events: readonly CommitEvent[],
  options: ScheduleOptions = {},
): EventSchedule {
  const n = events.length;
  const starts = new Float64Array(n + 1);
  const durations = new Float64Array(n);

  if (n === 0) {
    return { starts, durations, totalDurationSec: 0 };
  }

  const mode: PacingMode = options.mode ?? 'adaptive';
  const totalDurationSec =
    options.targetDurationSec !== undefined && options.targetDurationSec > 0
      ? options.targetDurationSec
      : computeAutoDurationSec(n);

  const highlightByIndex = new Map<number, Highlight>();
  if (options.highlights) {
    for (const h of options.highlights) {
      const prev = highlightByIndex.get(h.eventIndex);
      if (!prev || h.score > prev.score) {
        highlightByIndex.set(h.eventIndex, h);
      }
    }
  }

  const weights = new Float64Array(n);
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    let w = 1;
    if (mode === 'adaptive') {
      const ev = events[i]!;
      const changeBoost = Math.min(1.5, Math.log2(1 + ev.changes.length) * 0.25);
      w = 1 + changeBoost;

      // Compress long inactive gaps (> 7 days) into a brief documentary beat
      if (i > 0) {
        const dtSec = Math.max(0, ev.t - events[i - 1]!.t);
        if (dtSec > SEVEN_DAYS_SEC) {
          const days = dtSec / 86400;
          w += Math.min(0.6, Math.log10(days) * 0.3);
        }
      }

      // Slow down on narrative highlights and release tags
      const hl = highlightByIndex.get(i);
      if (hl) {
        w *= hl.type === 'release_tag' ? 3.0 : 2.2;
      }
    }
    weights[i] = w;
    totalWeight += w;
  }

  let acc = 0;
  for (let i = 0; i < n; i++) {
    starts[i] = acc;
    const d = totalWeight > 0 ? (weights[i]! / totalWeight) * totalDurationSec : 0;
    durations[i] = d;
    acc += d;
  }
  starts[n] = totalDurationSec;

  return { starts, durations, totalDurationSec };
}
