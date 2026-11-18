import { describe, expect, it } from 'vitest';
import {
  buildArchGraph,
  diffArchGraphs,
  extractModuleImports,
  layoutArchDiff,
} from '../src/index.js';

describe('Architecture Comparison Graph & Diff (U14 / FR-24, FR-25)', () => {
  it('extracts TypeScript, JavaScript, and Python imports while ignoring comments', () => {
    const tsCode = `
      // import { ignored } from './fake';
      /* import { alsoIgnored } from './nope'; */
      import { foo } from './utils.js';
      export { bar } from './bar';
      const dyn = import('./lazy');
      const cjs = require('../shared/config');
      import React from 'react';
    `;
    const tsImports = extractModuleImports(tsCode, 'ts');
    expect(tsImports).toEqual(['./utils.js', './bar', './lazy', '../shared/config', 'react']);

    const pyCode = `
      # import ignored_mod
      import os
      import pkg.sub as sub
      from .helpers import compute
      from ..core.engine import Runner
    `;
    const pyImports = extractModuleImports(pyCode, 'py');
    expect(pyImports).toEqual(['os', 'pkg.sub', '.helpers', '..core.engine']);
  });

  it('builds resolved internal module graphs and diffs added, removed, and changed nodes/edges', () => {
    const filesA = new Map<string, string>([
      ['src/index.ts', "import { a } from './a.js';\nimport { legacy } from './legacy.js';\n"],
      ['src/a.ts', 'export const a = 1;\n'],
      ['src/legacy.ts', 'export const legacy = 0;\n'],
    ]);

    const filesB = new Map<string, string>([
      ['src/index.ts', "import { a } from './a.js';\nimport { next } from './next.js';\n"],
      ['src/a.ts', 'export const a = 1;\n'],
      ['src/next.ts', "import { a } from './a.js';\nexport const next = a + 1;\n"],
    ]);

    const graphA = buildArchGraph('v0.1.0', filesA);
    const graphB = buildArchGraph('v1.0.0', filesB);
    const diff = diffArchGraphs(graphA, graphB);

    const byId = new Map(diff.nodes.map((n) => [n.id, n.status]));
    expect(byId.get('src/next.ts')).toBe('added');
    expect(byId.get('src/legacy.ts')).toBe('removed');
    expect(byId.get('src/index.ts')).toBe('changed'); // imports changed
    expect(byId.get('src/a.ts')).toBe('unchanged');

    expect(diff.summary.addedNodes).toBe(1);
    expect(diff.summary.removedNodes).toBe(1);
    expect(diff.summary.changedNodes).toBe(1);
    expect(diff.summary.addedEdges).toBe(2);
    expect(diff.summary.removedEdges).toBe(1);

    const laidOut = layoutArchDiff(diff, 900, 500);
    expect(laidOut.nodes).toHaveLength(4);
    expect(laidOut.edges).toHaveLength(diff.edges.length);
  });
});
