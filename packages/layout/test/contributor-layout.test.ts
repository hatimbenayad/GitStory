import { describe, expect, it } from 'vitest';
import type { History } from '@gitstory/core';
import {
  computeActiveContributors,
  computeContributorStream,
  getAuthorInitials,
} from '../src/index.js';

function makeHistory(): History {
  const base = 1700000000;
  return {
    schemaVersion: 1,
    repo: { name: 'contrib-test', head: 'h4' },
    authors: {
      'alice@ex.com': { name: 'Alice Smith', isBot: false },
      'bob@ex.com': { name: 'Bob Jones', isBot: false },
      'bot@ex.com': { name: 'dependabot[bot]', isBot: true },
    },
    tags: [],
    events: [
      {
        hash: 'h1',
        parents: [],
        t: base,
        author: 'alice@ex.com',
        message: 'init',
        isBot: false,
        changes: [{ path: 'src/a.ts', type: 'A', add: 10, del: 0 }],
      },
      {
        hash: 'h2',
        parents: ['h1'],
        t: base + 1000,
        author: 'bob@ex.com',
        message: 'feat',
        isBot: false,
        changes: [{ path: 'src/b.ts', type: 'A', add: 20, del: 0 }],
      },
      {
        hash: 'h3',
        parents: ['h2'],
        t: base + 2000,
        author: 'bot@ex.com',
        message: 'bump',
        isBot: true,
        changes: [{ path: 'package.json', type: 'M', add: 1, del: 1 }],
      },
      {
        hash: 'h4',
        parents: ['h3'],
        t: base + 3000,
        author: 'alice@ex.com',
        message: 'polish',
        isBot: false,
        changes: [{ path: 'src/a.ts', type: 'M', add: 5, del: 2 }],
      },
    ],
  };
}

describe('Contributor streamgraph & active markers (U9)', () => {
  it('computes centered streamgraph bands and filters bots when hideBots is enabled (FR-18, FR-8)', () => {
    const h = makeHistory();
    const withBots = computeContributorStream(h, { bucketCount: 4, hideBots: false });
    expect(withBots.series).toHaveLength(3);
    expect(withBots.maxStackHeight).toBeGreaterThan(0);

    const noBots = computeContributorStream(h, { bucketCount: 4, hideBots: true });
    expect(noBots.series).toHaveLength(2);
    expect(noBots.series.every((s) => !s.isBot)).toBe(true);

    // Every bucket point satisfies y1 >= y0
    for (const s of noBots.series) {
      for (const pt of s.points) {
        expect(pt.y1).toBeGreaterThanOrEqual(pt.y0);
      }
    }
  });

  it('tracks active contributors within a trailing window and generates initials', () => {
    const h = makeHistory();
    const active = computeActiveContributors(h, 3, { windowSize: 4, hideBots: true });
    expect(active.map((a) => a.authorId)).toEqual(['alice@ex.com', 'bob@ex.com']);
    expect(active[0]!.touchedPaths).toContain('src/a.ts');
    expect(getAuthorInitials('Alice Smith')).toBe('AS');
    expect(getAuthorInitials('dependabot[bot]')).toBe('DE');
  });

  it('handles empty history gracefully', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    const stream = computeContributorStream(empty);
    expect(stream.series).toEqual([]);
    expect(computeActiveContributors(empty, 0)).toEqual([]);
  });
});
