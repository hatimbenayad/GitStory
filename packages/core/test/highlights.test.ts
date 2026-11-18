import { describe, expect, it } from 'vitest';
import {
  TemplateNarrationProvider,
  buildChapters,
  detectHighlights,
  type CommitEvent,
  type History,
} from '../src/index.js';

function makeRichHistory(): History {
  const day = 86400;
  const base = 1700000000;
  const events: CommitEvent[] = [];

  // 10 small baseline commits by Alice
  for (let i = 0; i < 10; i++) {
    events.push({
      hash: `h${String(i).padStart(6, '0')}`,
      parents: i === 0 ? [] : [`h${String(i - 1).padStart(6, '0')}`],
      t: base + i * day,
      author: 'alice@ex.com',
      message: `chore: step ${i}`,
      isBot: false,
      changes: [{ path: `src/file_${i}.ts`, type: 'A', add: 10, del: 0 }],
    });
  }

  // Commit 10: introduces new top-level dir `packages/` AND is a huge commit
  events.push({
    hash: 'h000010',
    parents: ['h000009'],
    t: base + 12 * day,
    author: 'alice@ex.com',
    message: 'feat: introduce packages monorepo',
    isBot: false,
    changes: Array.from({ length: 15 }, (_, k) => ({
      path: `packages/core/mod_${k}.ts`,
      type: 'A' as const,
      add: 80,
      del: 0,
    })),
  });

  // Commit 11: mass deletion / refactor (6 deleted files)
  events.push({
    hash: 'h000011',
    parents: ['h000010'],
    t: base + 20 * day,
    author: 'alice@ex.com',
    message: 'refactor: remove legacy modules',
    isBot: false,
    changes: Array.from({ length: 6 }, (_, k) => ({
      path: `src/file_${k}.ts`,
      type: 'D' as const,
      add: 0,
      del: 60,
    })),
  });

  // Commits 12..15: contributor surge in new 30-day window (4 new unique authors!)
  const surgeAuthors = ['bob@ex.com', 'carol@ex.com', 'dave@ex.com', 'erin@ex.com'];
  for (let j = 0; j < surgeAuthors.length; j++) {
    const idx = 12 + j;
    events.push({
      hash: `h${String(idx).padStart(6, '0')}`,
      parents: [`h${String(idx - 1).padStart(6, '0')}`],
      t: base + (45 + j) * day,
      author: surgeAuthors[j]!,
      message: `feat: contribution by ${surgeAuthors[j]}`,
      isBot: false,
      changes: [{ path: `src/contrib_${j}.ts`, type: 'A', add: 20, del: 0 }],
    });
  }

  return {
    schemaVersion: 1,
    repo: { name: 'rich-repo', head: 'h000015' },
    authors: {
      'alice@ex.com': { name: 'Alice', isBot: false },
      'bob@ex.com': { name: 'Bob', isBot: false },
      'carol@ex.com': { name: 'Carol', isBot: false },
      'dave@ex.com': { name: 'Dave', isBot: false },
      'erin@ex.com': { name: 'Erin', isBot: false },
    },
    tags: [{ name: 'v1.0.0', hash: 'h000010', t: base + 12 * day }],
    events,
  };
}

describe('Highlights, Chapters & Optional Narration (U7)', () => {
  it('detects all 5 highlight categories and builds tag chapters (FR-9, FR-15)', () => {
    const history = makeRichHistory();
    const chapters = buildChapters(history);
    expect(chapters).toEqual([
      { name: 'v1.0.0', hash: 'h000010', eventIndex: 10, t: 1700000000 + 12 * 86400 },
    ]);

    const highlights = detectHighlights(history);
    const types = new Set(highlights.map((h) => h.type));
    expect(types.has('release_tag')).toBe(true);
    expect(types.has('new_top_dir')).toBe(true);
    expect(types.has('largest_commit')).toBe(true);
    expect(types.has('mass_refactor')).toBe(true);
    expect(types.has('contributor_surge')).toBe(true);
  });

  it('handles empty and tagless repositories cleanly', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    expect(buildChapters(empty)).toEqual([]);
    expect(detectHighlights(empty)).toEqual([]);
  });

  it('generates documentary captions via TemplateNarrationProvider with zero network calls (FR-28)', async () => {
    const history = makeRichHistory();
    const chapters = buildChapters(history);
    const highlights = detectHighlights(history);
    const provider = new TemplateNarrationProvider();
    const segments = await provider.generate({
      repoName: history.repo.name,
      chapters,
      highlights,
    });
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((s) => s.text.includes('v1.0.0'))).toBe(true);
  });
});
