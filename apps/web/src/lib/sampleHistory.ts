import type { History } from '@gitstory/core';

/**
 * Generates a realistic, self-contained demo `History` showcasing creations,
 * modifications, renames, deletions, tags/chapters, multiple contributors, and bots.
 */
export function createSampleHistory(): History {
  const base = 1704067200; // 2024-01-01T00:00:00Z
  const day = 86400;

  return {
    schemaVersion: 1,
    repo: {
      name: 'nebula-engine (sample)',
      head: 'c000014',
      defaultBranch: 'main',
    },
    authors: {
      'maya@nebula.dev': { name: 'Maya Lin', email: 'maya@nebula.dev', isBot: false },
      'liam@nebula.dev': { name: 'Liam Patel', email: 'liam@nebula.dev', isBot: false },
      'sofia@nebula.dev': { name: 'Sofia Rossi', email: 'sofia@nebula.dev', isBot: false },
      'noah@nebula.dev': { name: 'Noah Kim', email: 'noah@nebula.dev', isBot: false },
      'dependabot[bot]': {
        name: 'dependabot[bot]',
        email: 'dependabot[bot]@users.noreply.github.com',
        isBot: true,
      },
    },
    tags: [
      { name: 'v0.1.0', hash: 'c000004', t: base + 12 * day },
      { name: 'v0.5.0', hash: 'c000009', t: base + 65 * day },
      { name: 'v1.0.0', hash: 'c000014', t: base + 140 * day },
    ],
    events: [
      {
        hash: 'c000001',
        parents: [],
        t: base,
        author: 'maya@nebula.dev',
        message: 'feat: initial project scaffold and README',
        isBot: false,
        changes: [
          { path: 'README.md', type: 'A', add: 45, del: 0 },
          { path: 'package.json', type: 'A', add: 32, del: 0 },
          { path: 'src/index.ts', type: 'A', add: 28, del: 0 },
        ],
      },
      {
        hash: 'c000002',
        parents: ['c000001'],
        t: base + 3 * day,
        author: 'maya@nebula.dev',
        message: 'feat(core): add scene graph and vector math',
        isBot: false,
        changes: [
          { path: 'src/core/scene.ts', type: 'A', add: 140, del: 0 },
          { path: 'src/core/vec2.ts', type: 'A', add: 85, del: 0 },
          { path: 'src/index.ts', type: 'M', add: 14, del: 2 },
        ],
      },
      {
        hash: 'c000003',
        parents: ['c000002'],
        t: base + 7 * day,
        author: 'liam@nebula.dev',
        message: 'feat(render): add WebGL canvas renderer',
        isBot: false,
        changes: [
          { path: 'src/render/webgl.ts', type: 'A', add: 210, del: 0 },
          { path: 'src/render/shaders.ts', type: 'A', add: 95, del: 0 },
          { path: 'tests/scene.test.ts', type: 'A', add: 60, del: 0 },
        ],
      },
      {
        hash: 'c000004',
        parents: ['c000003'],
        t: base + 12 * day,
        author: 'maya@nebula.dev',
        message: 'release: v0.1.0 first public prototype',
        isBot: false,
        changes: [
          { path: 'CHANGELOG.md', type: 'A', add: 30, del: 0 },
          { path: 'docs/architecture.md', type: 'A', add: 75, del: 0 },
          { path: 'package.json', type: 'M', add: 2, del: 2 },
        ],
      },
      {
        hash: 'c000005',
        parents: ['c000004'],
        t: base + 40 * day,
        author: 'dependabot[bot]',
        message: 'chore(deps): bump vitest from 2.0.0 to 2.1.3',
        isBot: true,
        changes: [{ path: 'package.json', type: 'M', add: 1, del: 1 }],
      },
      {
        hash: 'c000006',
        parents: ['c000005'],
        t: base + 44 * day,
        author: 'sofia@nebula.dev',
        message: 'feat(ui): build timeline controls and HUD overlay',
        isBot: false,
        changes: [
          { path: 'src/ui/App.tsx', type: 'A', add: 165, del: 0 },
          { path: 'src/ui/Timeline.tsx', type: 'A', add: 130, del: 0 },
          { path: 'src/ui/Hud.tsx', type: 'A', add: 88, del: 0 },
          { path: 'src/ui/styles.css', type: 'A', add: 120, del: 0 },
        ],
      },
      {
        hash: 'c000007',
        parents: ['c000006'],
        t: base + 50 * day,
        author: 'noah@nebula.dev',
        message: 'feat(cli): add local extractor command',
        isBot: false,
        changes: [
          { path: 'cli/bin.ts', type: 'A', add: 110, del: 0 },
          { path: 'cli/parser.ts', type: 'A', add: 190, del: 0 },
          { path: 'tests/parser.test.ts', type: 'A', add: 95, del: 0 },
        ],
      },
      {
        hash: 'c000008',
        parents: ['c000007'],
        t: base + 58 * day,
        author: 'liam@nebula.dev',
        message: 'refactor(core): promote vec2 to math module and add camera',
        isBot: false,
        changes: [
          { path: 'src/core/math/vec2.ts', from: 'src/core/vec2.ts', type: 'R', add: 18, del: 4 },
          { path: 'src/core/math/camera.ts', type: 'A', add: 115, del: 0 },
          { path: 'src/render/webgl.ts', type: 'M', add: 42, del: 16 },
        ],
      },
      {
        hash: 'c000009',
        parents: ['c000008'],
        t: base + 65 * day,
        author: 'maya@nebula.dev',
        message: 'release: v0.5.0 interactive timeline and CLI',
        isBot: false,
        changes: [
          { path: 'CHANGELOG.md', type: 'M', add: 40, del: 0 },
          { path: 'docs/guide.md', type: 'A', add: 130, del: 0 },
          { path: 'package.json', type: 'M', add: 3, del: 1 },
        ],
      },
      {
        hash: 'c000010',
        parents: ['c000009'],
        t: base + 95 * day,
        author: 'sofia@nebula.dev',
        message: 'feat(views): add treemap and contributor streamgraph',
        isBot: false,
        changes: [
          { path: 'src/ui/TreemapView.tsx', type: 'A', add: 180, del: 0 },
          { path: 'src/ui/ContributorView.tsx', type: 'A', add: 210, del: 0 },
          { path: 'src/core/metrics.ts', type: 'A', add: 120, del: 0 },
          { path: 'src/ui/App.tsx', type: 'M', add: 35, del: 10 },
        ],
      },
      {
        hash: 'c000011',
        parents: ['c000010'],
        t: base + 110 * day,
        author: 'noah@nebula.dev',
        message: 'refactor: drop legacy shader pipeline and unify renderer',
        isBot: false,
        changes: [
          { path: 'src/render/shaders.ts', type: 'D', add: 0, del: 95 },
          { path: 'src/render/pipeline.ts', from: 'src/render/webgl.ts', type: 'R', add: 60, del: 45 },
          { path: 'tests/render.test.ts', type: 'A', add: 80, del: 0 },
        ],
      },
      {
        hash: 'c000012',
        parents: ['c000011'],
        t: base + 122 * day,
        author: 'liam@nebula.dev',
        message: 'feat(export): add WebCodecs MP4 and GIF89a export',
        isBot: false,
        changes: [
          { path: 'src/export/mp4.ts', type: 'A', add: 160, del: 0 },
          { path: 'src/export/gif.ts', type: 'A', add: 145, del: 0 },
          { path: 'src/ui/ExportModal.tsx', type: 'A', add: 135, del: 0 },
        ],
      },
      {
        hash: 'c000013',
        parents: ['c000012'],
        t: base + 132 * day,
        author: 'dependabot[bot]',
        message: 'chore(deps): security updates across workspace',
        isBot: true,
        changes: [{ path: 'package.json', type: 'M', add: 4, del: 4 }],
      },
      {
        hash: 'c000014',
        parents: ['c000013'],
        t: base + 140 * day,
        author: 'maya@nebula.dev',
        message: 'release: v1.0.0 production documentary release',
        isBot: false,
        changes: [
          { path: 'README.md', type: 'M', add: 65, del: 12 },
          { path: 'CHANGELOG.md', type: 'M', add: 55, del: 0 },
          { path: 'package.json', type: 'M', add: 2, del: 2 },
        ],
      },
    ],
  };
}
