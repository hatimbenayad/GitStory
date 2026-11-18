import { describe, expect, it } from 'vitest';
import { ReplayEngine, type History } from '@gitstory/core';
import { StableTreeLayout, getPaletteColor } from '../src/index.js';

function makeHistory(): History {
  return {
    schemaVersion: 1,
    repo: { name: 'tree-test', head: '0000003' },
    authors: { a: { name: 'Alice', isBot: false } },
    tags: [],
    events: [
      {
        hash: '0000001',
        parents: [],
        t: 100,
        author: 'a',
        message: 'init two branches',
        isBot: false,
        changes: [
          { path: 'alpha/one.ts', type: 'A', add: 40, del: 0 },
          { path: 'alpha/two.ts', type: 'A', add: 20, del: 0 },
          { path: 'beta/base.py', type: 'A', add: 30, del: 0 },
        ],
      },
      {
        hash: '0000002',
        parents: ['0000001'],
        t: 200,
        author: 'a',
        message: 'add files only inside beta',
        isBot: false,
        changes: [
          { path: 'beta/extra1.py', type: 'A', add: 25, del: 0 },
          { path: 'beta/extra2.py', type: 'A', add: 15, del: 0 },
        ],
      },
      {
        hash: '0000003',
        parents: ['0000002'],
        t: 300,
        author: 'a',
        message: 'rename beta/base.py -> alpha/moved.py',
        isBot: false,
        changes: [
          { path: 'alpha/moved.py', from: 'beta/base.py', type: 'R', add: 5, del: 0 },
        ],
      },
    ],
  };
}

describe('StableTreeLayout (U5)', () => {
  it('keeps unrelated branch nodes completely stationary when another branch grows (FR-22)', () => {
    const engine = new ReplayEngine(makeHistory());
    const layout = new StableTreeLayout();

    const frame0 = layout.compute(engine.getStateAt(0));
    const frame1 = layout.compute(engine.getStateAt(1));

    const alphaOne0 = frame0.nodes.find((n) => n.path === 'alpha/one.ts')!;
    const alphaOne1 = frame1.nodes.find((n) => n.path === 'alpha/one.ts')!;
    expect(alphaOne0).toBeDefined();
    expect(alphaOne1).toBeDefined();

    const dist = Math.hypot(alphaOne1.x - alphaOne0.x, alphaOne1.y - alphaOne0.y);
    expect(dist).toBeLessThan(1e-6);
  });

  it('tracks previous coordinates across renames preserving entity ID (FR-11, FR-16)', () => {
    const engine = new ReplayEngine(makeHistory());
    const layout = new StableTreeLayout();

    const frame1 = layout.compute(engine.getStateAt(1));
    const before = frame1.nodes.find((n) => n.path === 'beta/base.py')!;
    const frame2 = layout.compute(engine.getStateAt(2));
    const after = frame2.nodes.find((n) => n.path === 'alpha/moved.py')!;

    expect(after.id).toBe(before.id);
    expect(after.prevX).toBeCloseTo(before.x, 4);
    expect(after.prevY).toBeCloseTo(before.y, 4);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(10);
  });

  it('handles empty state cleanly and provides distinct default & colorblind-safe palettes', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    const engine = new ReplayEngine(empty);
    const layout = new StableTreeLayout();
    const frame = layout.compute(engine.getStateAt(0));
    expect(frame.nodes).toHaveLength(1); // root node
    expect(frame.edges).toHaveLength(0);

    expect(getPaletteColor('ts', false)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getPaletteColor('ts', true)).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
