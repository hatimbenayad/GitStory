import type { Chapter, CommitEvent, Highlight } from '@gitstory/core';
import { computeEventSchedule, type EventSchedule, type PacingMode } from './pacing.js';

export interface TimelineOptions {
  mode?: PacingMode;
  targetDurationSec?: number;
  speed?: number;
  highlights?: readonly Highlight[];
  chapters?: readonly Chapter[];
}

export interface TimelineSnapshot {
  currentTimeSec: number;
  totalDurationSec: number;
  progress: number;
  eventIndex: number;
  eventProgress: number;
  playing: boolean;
  speed: number;
  mode: PacingMode;
  activeChapter: Chapter | null;
  activeHighlight: Highlight | null;
}

export type TimelineListener = (snapshot: TimelineSnapshot) => void;

const MIN_SPEED = 0.25;
const MAX_SPEED = 16;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Custom virtual-clock timeline engine for documentary playback, scrubbing,
 * chapter navigation, and deterministic export stepping (`FR-20`, `FR-21`).
 */
export class TimelineEngine {
  private readonly events: readonly CommitEvent[];
  private readonly chapters: readonly Chapter[];
  private readonly highlights: readonly Highlight[];
  private readonly highlightByIndex: Map<number, Highlight> = new Map();
  private readonly listeners: Set<TimelineListener> = new Set();

  private mode: PacingMode;
  private targetDurationSec?: number;
  private speed: number;
  private playing = false;
  private currentTimeSec = 0;
  private schedule: EventSchedule;

  constructor(events: readonly CommitEvent[], options: TimelineOptions = {}) {
    this.events = events;
    this.chapters = [...(options.chapters ?? [])].sort((a, b) => a.eventIndex - b.eventIndex);
    this.highlights = [...(options.highlights ?? [])];
    for (const hl of this.highlights) {
      const prev = this.highlightByIndex.get(hl.eventIndex);
      if (!prev || hl.score > prev.score) {
        this.highlightByIndex.set(hl.eventIndex, hl);
      }
    }
    this.mode = options.mode ?? 'adaptive';
    this.targetDurationSec = options.targetDurationSec;
    this.speed = clamp(options.speed ?? 1, MIN_SPEED, MAX_SPEED);
    this.schedule = this.buildSchedule();
  }

  private buildSchedule(): EventSchedule {
    return computeEventSchedule(this.events, {
      mode: this.mode,
      ...(this.targetDurationSec !== undefined
        ? { targetDurationSec: this.targetDurationSec }
        : {}),
      highlights: this.highlights,
    });
  }

  private findEventAtTime(timeSec: number): { eventIndex: number; eventProgress: number } {
    const n = this.events.length;
    if (n === 0) return { eventIndex: -1, eventProgress: 0 };
    if (n === 1) {
      const dur = this.schedule.durations[0] ?? 1;
      return { eventIndex: 0, eventProgress: dur > 0 ? clamp(timeSec / dur, 0, 1) : 1 };
    }

    const t = clamp(timeSec, 0, this.schedule.totalDurationSec);
    if (t >= this.schedule.totalDurationSec) {
      return { eventIndex: n - 1, eventProgress: 1 };
    }

    // Binary search for largest i where starts[i] <= t
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.schedule.starts[mid]! <= t) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    const start = this.schedule.starts[lo]!;
    const dur = this.schedule.durations[lo]!;
    const eventProgress = dur > 0 ? clamp((t - start) / dur, 0, 1) : 0;
    return { eventIndex: lo, eventProgress };
  }

  private findActiveChapter(eventIndex: number): Chapter | null {
    if (this.chapters.length === 0 || eventIndex < 0) return null;
    let active: Chapter | null = null;
    for (const ch of this.chapters) {
      if (ch.eventIndex <= eventIndex) {
        active = ch;
      } else {
        break;
      }
    }
    return active;
  }

  private buildSnapshot(timeSec: number, playing: boolean): TimelineSnapshot {
    const total = this.schedule.totalDurationSec;
    const clampedTime = total > 0 ? clamp(timeSec, 0, total) : 0;
    const { eventIndex, eventProgress } = this.findEventAtTime(clampedTime);
    const progress = total > 0 ? clampedTime / total : 0;

    return {
      currentTimeSec: clampedTime,
      totalDurationSec: total,
      progress,
      eventIndex,
      eventProgress,
      playing,
      speed: this.speed,
      mode: this.mode,
      activeChapter: this.findActiveChapter(eventIndex),
      activeHighlight: eventIndex >= 0 ? (this.highlightByIndex.get(eventIndex) ?? null) : null,
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  /** Subscribes to timeline snapshot changes; returns an unsubscribe function. */
  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Returns the current live playback snapshot. */
  getSnapshot(): TimelineSnapshot {
    return this.buildSnapshot(this.currentTimeSec, this.playing);
  }

  /** Purely samples the timeline at any virtual timestamp (for deterministic export). */
  sampleAtTime(timeSec: number): TimelineSnapshot {
    return this.buildSnapshot(timeSec, false);
  }

  /** Starts playback; restarts from 0 if already at the very end. */
  play(): void {
    if (this.events.length === 0) return;
    if (this.currentTimeSec >= this.schedule.totalDurationSec) {
      this.currentTimeSec = 0;
    }
    if (!this.playing) {
      this.playing = true;
      this.emit();
    }
  }

  /** Pauses playback. */
  pause(): void {
    if (this.playing) {
      this.playing = false;
      this.emit();
    }
  }

  /** Toggles between play and pause. */
  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Advances the virtual clock by `dtMs` milliseconds (scaled by `speed`) when playing. */
  tick(dtMs: number): TimelineSnapshot {
    if (!this.playing || this.events.length === 0 || dtMs <= 0) {
      return this.getSnapshot();
    }
    const nextTime = this.currentTimeSec + (dtMs / 1000) * this.speed;
    if (nextTime >= this.schedule.totalDurationSec) {
      this.currentTimeSec = this.schedule.totalDurationSec;
      this.playing = false;
    } else {
      this.currentTimeSec = nextTime;
    }
    const snap = this.getSnapshot();
    this.emit();
    return snap;
  }

  /** Seeks directly to a virtual timestamp in seconds. */
  seekToTime(timeSec: number): void {
    this.currentTimeSec =
      this.schedule.totalDurationSec > 0
        ? clamp(timeSec, 0, this.schedule.totalDurationSec)
        : 0;
    this.emit();
  }

  /** Seeks to normalized progress `[0, 1]`. */
  seekToProgress(progress: number): void {
    this.seekToTime(clamp(progress, 0, 1) * this.schedule.totalDurationSec);
  }

  /** Seeks to the start time of a specific commit index. */
  seekToIndex(index: number): void {
    if (this.events.length === 0) return;
    const idx = clamp(Math.floor(index), 0, this.events.length - 1);
    this.currentTimeSec = this.schedule.starts[idx] ?? 0;
    this.emit();
  }

  /** Steps forward or backward by `delta` commits. */
  stepIndex(delta: number): void {
    const cur = this.getSnapshot().eventIndex;
    if (cur < 0) return;
    this.seekToIndex(cur + delta);
  }

  /** Jumps to chapter by array index or chapter name. */
  jumpToChapter(chapterOrIndex: number | string): boolean {
    const ch =
      typeof chapterOrIndex === 'number'
        ? this.chapters[chapterOrIndex]
        : this.chapters.find((c) => c.name === chapterOrIndex);
    if (!ch) return false;
    this.seekToIndex(ch.eventIndex);
    return true;
  }

  /** Jumps to the next chapter after the current commit index. */
  nextChapter(): boolean {
    const cur = this.getSnapshot().eventIndex;
    const next = this.chapters.find((c) => c.eventIndex > cur);
    if (!next) return false;
    this.seekToIndex(next.eventIndex);
    return true;
  }

  /** Jumps to the previous chapter before the current commit index. */
  prevChapter(): boolean {
    const cur = this.getSnapshot().eventIndex;
    for (let i = this.chapters.length - 1; i >= 0; i--) {
      if (this.chapters[i]!.eventIndex < cur) {
        this.seekToIndex(this.chapters[i]!.eventIndex);
        return true;
      }
    }
    return false;
  }

  /** Updates playback speed multiplier (`0.25`–`16`). */
  setSpeed(speed: number): void {
    this.speed = clamp(speed, MIN_SPEED, MAX_SPEED);
    this.emit();
  }

  /** Switches between `'adaptive'` and `'constant'` pacing without jumping eventIndex. */
  setMode(mode: PacingMode): void {
    if (this.mode === mode) return;
    const prevIdx = this.getSnapshot().eventIndex;
    this.mode = mode;
    this.schedule = this.buildSchedule();
    if (prevIdx >= 0 && prevIdx < this.events.length) {
      this.currentTimeSec = this.schedule.starts[prevIdx] ?? 0;
    }
    this.emit();
  }

  /** Returns normalized `[0, 1]` timeline positions for each chapter marker. */
  getChapterPositions(): Array<{ chapter: Chapter; progress: number }> {
    const total = this.schedule.totalDurationSec;
    return this.chapters.map((chapter) => {
      const start = this.schedule.starts[chapter.eventIndex] ?? 0;
      return { chapter, progress: total > 0 ? start / total : 0 };
    });
  }

  /** Returns normalized `[0, 1]` timeline positions for highlights. */
  getHighlightPositions(): Array<{ highlight: Highlight; progress: number }> {
    const total = this.schedule.totalDurationSec;
    return this.highlights.map((highlight) => {
      const start = this.schedule.starts[highlight.eventIndex] ?? 0;
      return { highlight, progress: total > 0 ? start / total : 0 };
    });
  }
}
