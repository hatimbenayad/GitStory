import { describe, expect, it } from 'vitest';
import { ReplayEngine, type History } from '@gitstory/core';
import { computeTreemapLayout } from '../src/index.js';

function makeHistory(): History {
  return {
    schemaVersion: 1,
    repo: { name: 'tm-test', head: 'h1' },
    authors: { a: { name: 'Alice', isBot: false } },
    tags: [],
    events: [
      {
        hash: 'h1',
        parents: [],
        t: 100,
        author: 'a',
        message: 'init',
        isBot: false,
        changes: [
          { path: 'src/big.ts', type: 'A', add: 400, del: 0 },
          { path: 'src/small.ts', type: 'A', add: 40, del: 0 },
          { path: 'assets/empty.bin', type: 'A', add: 0, del: 0 },
          { path: 'README.md', type: 'A', add: 60, del: 0 },
        ],
      },
    ],
  };
}

describe('computeTreemapLayout (U8)', () => {
  it('produces valid non-overlapping leaf rectangles within viewport bounds including zero-line files (FR-17)', () => {
    const engine = new ReplayEngine(makeHistory());
    const rects = computeTreemapLayout(engine.getStateAt(0), 800, 500);
    const leaves = rects.filter((r) => r.kind === 'file');

    expect(leaves).toHaveLength(4);

    for (const r of leaves) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(800.01);
      expect(r.y1).toBeLessThanOrEqual(500.01);
      expect(r.x1).toBeGreaterThanOrEqual(r.x0);
      expect(r.y1).toBeGreaterThanOrEqual(r.y0);
    }

    // Check pairwise non-overlap between leaves
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        expect(overlapX <= 0.01 || overlapY <= 0.01).toBe(true);
      }
    }

    // Bigger file gets bigger area
    const big = leaves.find((l) => l.path === 'src/big.ts')!;
    const small = leaves.find((l) => l.path === 'src/small.ts')!;
    const bigArea = (big.x1 - big.x0) * (big.y1 - big.y0);
    const smallArea = (small.x1 - small.x0) * (small.y1 - small.y0);
    expect(bigArea).toBeGreaterThan(smallArea * 4);
  });

  it('handles empty state cleanly', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    const engine = new ReplayEngine(empty);
    expect(computeTreemapLayout(engine.getStateAt(0), 800, 500)).toEqual([]);
  });
});
