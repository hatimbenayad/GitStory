import { describe, expect, it } from 'vitest';
import type { Chapter, CommitEvent, Highlight } from '@gitstory/core';
import { TimelineEngine, computeEventSchedule } from '../src/index.js';

function makeEvents(): CommitEvent[] {
  const day = 86400;
  return [
    {
      hash: '0000001',
      parents: [],
      t: 1700000000,
      author: 'a',
      message: 'init',
      isBot: false,
      changes: [{ path: 'a.ts', type: 'A', add: 10, del: 0 }],
    },
    // 6 months dead gap (~180 days)
    {
      hash: '0000002',
      parents: ['0000001'],
      t: 1700000000 + 180 * day,
      author: 'a',
      message: 'resume after hiatus',
      isBot: false,
      changes: [{ path: 'b.ts', type: 'A', add: 10, del: 0 }],
    },
    // Release highlight commit with many changes
    {
      hash: '0000003',
      parents: ['0000002'],
      t: 1700000000 + 181 * day,
      author: 'a',
      message: 'v1.0 release',
      isBot: false,
      changes: Array.from({ length: 12 }, (_, i) => ({
        path: `src/f${i}.ts`,
        type: 'A' as const,
        add: 20,
        del: 0,
      })),
    },
    {
      hash: '0000004',
      parents: ['0000003'],
      t: 1700000000 + 182 * day,
      author: 'a',
      message: 'patch',
      isBot: false,
      changes: [{ path: 'a.ts', type: 'M', add: 1, del: 1 }],
    },
  ];
}

describe('TimelineEngine & Pacing (U4)', () => {
  it('assigns equal slots in constant mode and slows on highlights / compresses gaps in adaptive mode (FR-21)', () => {
    const events = makeEvents();
    const highlights: Highlight[] = [
      {
        id: 'h1',
        type: 'release_tag',
        eventIndex: 2,
        hash: '0000003',
        t: events[2]!.t,
        score: 1,
        title: 'v1.0',
        detail: 'Release v1.0',
      },
    ];

    const constSched = computeEventSchedule(events, {
      mode: 'constant',
      targetDurationSec: 20,
      highlights,
    });
    expect(constSched.durations[0]).toBeCloseTo(5, 5);
    expect(constSched.durations[2]).toBeCloseTo(5, 5);

    const adaptSched = computeEventSchedule(events, {
      mode: 'adaptive',
      targetDurationSec: 20,
      highlights,
    });
    // Highlight commit (index 2) gets noticeably longer duration than normal commit (index 3)
    expect(adaptSched.durations[2]!).toBeGreaterThan(adaptSched.durations[3]! * 2);
    // 6-month gap does NOT dominate total duration (remains compressed < 40% of total)
    expect(adaptSched.durations[1]!).toBeLessThan(8);
    // Cumulative ends at targetDurationSec
    expect(adaptSched.starts[events.length]!).toBeCloseTo(20, 5);
  });

  it('plays, pauses, ticks, seeks monotonically, preserves index on mode switch, and jumps chapters (FR-20)', () => {
    const events = makeEvents();
    const chapters: Chapter[] = [
      { name: 'v0.1', hash: '0000001', eventIndex: 0, t: events[0]!.t },
      { name: 'v1.0', hash: '0000003', eventIndex: 2, t: events[2]!.t },
    ];
    const engine = new TimelineEngine(events, {
      mode: 'adaptive',
      targetDurationSec: 10,
      chapters,
    });

    expect(engine.getSnapshot().eventIndex).toBe(0);
    expect(engine.getSnapshot().playing).toBe(false);

    engine.play();
    engine.tick(5000);
    const mid = engine.getSnapshot();
    expect(mid.currentTimeSec).toBeCloseTo(5, 4);
    expect(mid.eventIndex).toBeGreaterThanOrEqual(1);

    // Switching mode preserves exact eventIndex
    const prevIdx = mid.eventIndex;
    engine.setMode('constant');
    expect(engine.getSnapshot().eventIndex).toBe(prevIdx);

    // Chapter jumps
    engine.jumpToChapter(1);
    expect(engine.getSnapshot().eventIndex).toBe(2);
    expect(engine.getSnapshot().activeChapter?.name).toBe('v1.0');

    engine.prevChapter();
    expect(engine.getSnapshot().eventIndex).toBe(0);

    // Deterministic sampleAtTime does not mutate live state
    const liveBefore = engine.getSnapshot().currentTimeSec;
    const sample = engine.sampleAtTime(9.9);
    expect(sample.eventIndex).toBe(3);
    expect(engine.getSnapshot().currentTimeSec).toBe(liveBefore);
  });

  it('handles empty and single-commit repositories cleanly without NaN', () => {
    const emptyEngine = new TimelineEngine([]);
    emptyEngine.play();
    emptyEngine.tick(1000);
    const es = emptyEngine.getSnapshot();
    expect(es.eventIndex).toBe(-1);
    expect(Number.isNaN(es.progress)).toBe(false);

    const singleEngine = new TimelineEngine([makeEvents()[0]!]);
    singleEngine.seekToProgress(0.5);
    expect(singleEngine.getSnapshot().eventIndex).toBe(0);
    expect(Number.isNaN(singleEngine.getSnapshot().eventProgress)).toBe(false);
  });
});
