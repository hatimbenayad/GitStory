import { describe, expect, it } from 'vitest';
import {
  ReplayEngine,
  applyCommitEvent,
  createEmptyState,
  type CommitEvent,
  type History,
  type RepoState,
} from '../src/index.js';

function snapshotSummary(state: RepoState) {
  return {
    eventIndex: state.eventIndex,
    t: state.t,
    totalFiles: state.totalFiles,
    totalLines: state.totalLines,
    uniqueAuthors: [...state.uniqueAuthors].sort(),
    files: [...state.files.values()]
      .map((f) => ({
        id: f.id,
        path: f.path,
        lines: f.lines,
        dir: f.dir,
        ext: f.ext,
        lastAuthor: f.lastAuthor,
        touchCount: f.touchCount,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    dirs: [...state.dirs.values()]
      .map((d) => ({
        path: d.path,
        fileCount: d.fileCount,
        totalLines: d.totalLines,
        childrenDirs: [...d.childrenDirs].sort(),
        childrenFiles: [...d.childrenFiles].sort(),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function makeSyntheticHistory(count: number): History {
  const events: CommitEvent[] = [];
  const activePaths: string[] = [];
  let seed = 42;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const dirs = ['src', 'src/core', 'src/ui', 'packages/a', 'docs', 'tests'];
  const exts = ['ts', 'tsx', 'md', 'json', 'css'];
  const authorsList = ['alice@ex.com', 'bob@ex.com', 'carol@ex.com'];

  for (let i = 0; i < count; i++) {
    const changes: CommitEvent['changes'] = [];
    const numOps = 1 + Math.floor(rand() * 3);
    for (let op = 0; op < numOps; op++) {
      const r = rand();
      if (activePaths.length === 0 || r < 0.45) {
        const dir = dirs[Math.floor(rand() * dirs.length)]!;
        const ext = exts[Math.floor(rand() * exts.length)]!;
        const path = `${dir}/file_${i}_${op}.${ext}`;
        if (!activePaths.includes(path)) {
          activePaths.push(path);
          changes.push({ path, type: 'A', add: 10 + Math.floor(rand() * 80), del: 0 });
        }
      } else if (r < 0.72) {
        const idx = Math.floor(rand() * activePaths.length);
        const path = activePaths[idx]!;
        changes.push({
          path,
          type: 'M',
          add: Math.floor(rand() * 30),
          del: Math.floor(rand() * 15),
        });
      } else if (r < 0.85) {
        const idx = Math.floor(rand() * activePaths.length);
        const from = activePaths[idx]!;
        const dir = dirs[Math.floor(rand() * dirs.length)]!;
        const to = `${dir}/renamed_${i}_${op}.ts`;
        if (!activePaths.includes(to)) {
          activePaths[idx] = to;
          changes.push({ path: to, from, type: 'R', add: 2, del: 1 });
        }
      } else if (r < 0.92) {
        const idx = Math.floor(rand() * activePaths.length);
        const from = activePaths[idx]!;
        const to = `docs/copy_${i}_${op}.md`;
        if (!activePaths.includes(to)) {
          activePaths.push(to);
          changes.push({ path: to, from, type: 'C', add: 5, del: 0 });
        }
      } else {
        const idx = Math.floor(rand() * activePaths.length);
        const path = activePaths.splice(idx, 1)[0]!;
        changes.push({ path, type: 'D', add: 0, del: 20 });
      }
    }

    const author = authorsList[i % authorsList.length]!;
    events.push({
      hash: i.toString(16).padStart(7, '0'),
      parents: i === 0 ? [] : [(i - 1).toString(16).padStart(7, '0')],
      t: 1700000000 + i * 3600,
      author,
      message: `commit ${i}`,
      isBot: false,
      changes,
    });
  }

  return {
    schemaVersion: 1,
    repo: { name: 'synthetic', head: (count - 1).toString(16).padStart(7, '0') },
    authors: {
      'alice@ex.com': { name: 'Alice', email: 'alice@ex.com', isBot: false },
      'bob@ex.com': { name: 'Bob', email: 'bob@ex.com', isBot: false },
      'carol@ex.com': { name: 'Carol', email: 'carol@ex.com', isBot: false },
    },
    tags: [],
    events,
  };
}

describe('ReplayEngine (U3)', () => {
  it('handles A, M, R (preserving entity id), C, D, and prunes empty directories', () => {
    const history: History = {
      schemaVersion: 1,
      repo: { name: 'unit', head: '0000004' },
      authors: { a: { name: 'Alice', isBot: false } },
      tags: [],
      events: [
        {
          hash: '0000001',
          parents: [],
          t: 100,
          author: 'a',
          message: 'add files',
          isBot: false,
          changes: [
            { path: 'src/deep/old.ts', type: 'A', add: 50, del: 0 },
            { path: 'README.md', type: 'A', add: 10, del: 0 },
          ],
        },
        {
          hash: '0000002',
          parents: ['0000001'],
          t: 200,
          author: 'a',
          message: 'modify & rename',
          isBot: false,
          changes: [
            { path: 'src/moved/new.ts', from: 'src/deep/old.ts', type: 'R', add: 5, del: 2 },
            { path: 'README.md', type: 'M', add: 4, del: 1 },
          ],
        },
        {
          hash: '0000003',
          parents: ['0000002'],
          t: 300,
          author: 'a',
          message: 'copy & delete',
          isBot: false,
          changes: [
            { path: 'docs/copy.ts', from: 'src/moved/new.ts', type: 'C', add: 1, del: 0 },
            { path: 'src/moved/new.ts', type: 'D', add: 0, del: 53 },
          ],
        },
      ],
    };

    const engine = new ReplayEngine(history, { keyframeInterval: 2 });
    const s0 = engine.getStateAt(0);
    const origId = s0.files.get('src/deep/old.ts')?.id;
    expect(origId).toBeDefined();
    expect(s0.dirs.has('src/deep')).toBe(true);

    const s1 = engine.getStateAt(1);
    expect(s1.files.has('src/deep/old.ts')).toBe(false);
    expect(s1.dirs.has('src/deep')).toBe(false); // empty dir pruned!
    expect(s1.files.get('src/moved/new.ts')?.id).toBe(origId); // ID preserved across rename!
    expect(s1.files.get('src/moved/new.ts')?.lines).toBe(53);
    expect(s1.files.get('README.md')?.lines).toBe(13);

    const s2 = engine.getStateAt(2);
    expect(s2.files.has('src/moved/new.ts')).toBe(false);
    expect(s2.dirs.has('src/moved')).toBe(false);
    expect(s2.dirs.has('src')).toBe(false);
    expect(s2.files.get('docs/copy.ts')?.lines).toBe(54);
    expect(s2.files.get('docs/copy.ts')?.id).not.toBe(origId);
    expect(s2.totalFiles).toBe(2);
    expect(s2.totalLines).toBe(67);
  });

  it('handles empty repos and shallow-clone orphan modifies/deletes gracefully', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    const emptyEngine = new ReplayEngine(empty);
    expect(emptyEngine.getStateAt(0).totalFiles).toBe(0);
    expect(emptyEngine.getStateAt(-1).eventIndex).toBe(-1);

    const shallow: History = {
      schemaVersion: 1,
      repo: { name: 'shallow', head: '111' },
      authors: { a: { name: 'A', isBot: false } },
      tags: [],
      events: [
        {
          hash: '111',
          parents: ['000'],
          t: 100,
          author: 'a',
          message: 'shallow modify + delete unseen',
          isBot: false,
          changes: [
            { path: 'existing.ts', type: 'M', add: 10, del: 25 },
            { path: 'unseen.ts', type: 'D', add: 0, del: 50 },
          ],
        },
      ],
    };
    const shallowEngine = new ReplayEngine(shallow);
    const state = shallowEngine.getStateAt(0);
    expect(state.files.get('existing.ts')?.lines).toBe(0);
    expect(state.files.has('unseen.ts')).toBe(false);
    expect(state.totalLines).toBe(0);
  });

  it('property test: scrubbing to any random index equals fresh 0..k replay', () => {
    const history = makeSyntheticHistory(240);
    const engine = new ReplayEngine(history, { keyframeInterval: 25 });
    expect(engine.getKeyframeCount()).toBeGreaterThanOrEqual(9);

    // Precompute ground truth by pure sequential replay
    const expectedSnapshots: ReturnType<typeof snapshotSummary>[] = [];
    let state = createEmptyState();
    for (let i = 0; i < history.events.length; i++) {
      state = applyCommitEvent(state, history.events[i]!, i);
      expectedSnapshots.push(snapshotSummary(state));
    }

    // Scrub in arbitrary back-and-forth order
    const probeIndices = [239, 0, 125, 24, 25, 26, 199, 50, 49, 173, 12, 238, 100, 75, 1];
    for (const idx of probeIndices) {
      const scrubbed = engine.getStateAt(idx);
      expect(snapshotSummary(scrubbed)).toEqual(expectedSnapshots[idx]);
    }
  });
});
