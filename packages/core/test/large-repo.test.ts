import { describe, expect, it } from 'vitest';
import {
  ReplayEngine,
  aggregateHistory,
  collapseRepoState,
  resolveLargeRepoPolicy,
  type CommitEvent,
  type History,
} from '../src/index.js';

function makeMultiDayHistory(): History {
  const base = 1704067200; // 2024-01-01 00:00:00 UTC
  const hour = 3600;
  const day = 86400;

  const events: CommitEvent[] = [
    {
      hash: 'c1',
      parents: [],
      t: base + hour,
      author: 'alice',
      message: 'day1 add',
      isBot: false,
      changes: [
        { path: 'a/b/c/d/deep1.ts', type: 'A', add: 40, del: 0 },
        { path: 'temp.ts', type: 'A', add: 20, del: 0 },
      ],
    },
    {
      hash: 'c2',
      parents: ['c1'],
      t: base + 2 * hour,
      author: 'alice',
      message: 'day1 mod + delete temp',
      isBot: false,
      changes: [
        { path: 'a/b/c/d/deep1.ts', type: 'M', add: 10, del: 5 },
        { path: 'temp.ts', type: 'D', add: 0, del: 20 },
      ],
    },
    {
      hash: 'c3',
      parents: ['c2'],
      t: base + day + hour,
      author: 'bob',
      message: 'day2 release',
      isBot: false,
      changes: [
        { path: 'a/b/c/d/deep2.ts', type: 'A', add: 30, del: 0 },
        { path: 'src/root.ts', type: 'A', add: 100, del: 0 },
      ],
    },
  ];

  return {
    schemaVersion: 1,
    repo: { name: 'large-test', head: 'c3' },
    authors: {
      alice: { name: 'Alice', isBot: false },
      bob: { name: 'Bob', isBot: false },
    },
    tags: [{ name: 'v1.0', hash: 'c3', t: base + day + hour }],
    events,
  };
}

describe('Large-repo strategy (U11 / FR-23)', () => {
  it('auto-selects commit/day/week granularity based on commit count', () => {
    expect(resolveLargeRepoPolicy(500).granularity).toBe('commit');
    expect(resolveLargeRepoPolicy(3500).granularity).toBe('day');
    expect(resolveLargeRepoPolicy(12000).granularity).toBe('week');
  });

  it('aggregates commits into daily buckets while preserving tags and final file state', () => {
    const raw = makeMultiDayHistory();
    const agg = aggregateHistory(raw, { granularity: 'day' });

    expect(agg.events).toHaveLength(2); // 2 distinct UTC days
    expect(agg.tags).toHaveLength(1);
    expect(agg.events.some((e) => e.hash === agg.tags[0]!.hash)).toBe(true);

    // Final file states match between raw and aggregated histories
    const rawFinal = new ReplayEngine(raw).getStateAt(raw.events.length - 1);
    const aggFinal = new ReplayEngine(agg).getStateAt(agg.events.length - 1);

    expect([...aggFinal.files.keys()].sort()).toEqual([...rawFinal.files.keys()].sort());
    expect(aggFinal.totalLines).toBe(rawFinal.totalLines);
  });

  it('collapses deep directories beyond maxDepth and strictly enforces maxNodes', () => {
    const events: CommitEvent[] = [
      {
        hash: 'h1',
        parents: [],
        t: 100,
        author: 'a',
        message: 'many deep files',
        isBot: false,
        changes: Array.from({ length: 40 }, (_, i) => ({
          path: `pkg/sub/deep/deeper/file_${i}.ts`,
          type: 'A' as const,
          add: 10 + i,
          del: 0,
        })),
      },
    ];
    const history: History = {
      schemaVersion: 1,
      repo: { name: 'deep', head: 'h1' },
      authors: { a: { name: 'A', isBot: false } },
      tags: [],
      events,
    };

    const rawState = new ReplayEngine(history).getStateAt(0);
    const collapsedDepth = collapseRepoState(rawState, { maxDepth: 2, maxNodes: 500 });
    expect(collapsedDepth.totalFiles).toBeLessThan(rawState.totalFiles);
    expect(collapsedDepth.totalLines).toBe(rawState.totalLines);

    const capped = collapseRepoState(rawState, { maxDepth: 10, maxNodes: 10 });
    expect(capped.files.size + capped.dirs.size).toBeLessThanOrEqual(10);
    expect(capped.totalLines).toBe(rawState.totalLines);
  });
});
