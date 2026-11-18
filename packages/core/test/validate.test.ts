import { describe, expect, it } from 'vitest';
import {
  HISTORY_JSON_SCHEMA_V1,
  assertValidHistory,
  validateHistory,
  type History,
} from '../src/index.js';

function makeValidHistory(): History {
  return {
    schemaVersion: 1,
    repo: {
      name: 'demo-repo',
      head: 'abc1234',
      defaultBranch: 'main',
    },
    authors: {
      'alice@example.com': {
        name: 'Alice',
        email: 'alice@example.com',
        isBot: false,
      },
      'dependabot[bot]': {
        name: 'dependabot[bot]',
        email: 'dependabot[bot]@users.noreply.github.com',
        isBot: true,
      },
    },
    tags: [{ name: 'v0.1.0', hash: 'abc1234', t: 1700000100 }],
    events: [
      {
        hash: 'abc1234',
        parents: [],
        t: 1700000000,
        author: 'alice@example.com',
        message: 'feat: initial commit',
        isBot: false,
        changes: [
          { path: 'README.md', type: 'A', add: 10, del: 0 },
          { path: 'src/café file "1".ts', type: 'A', add: 42, del: 0 },
        ],
      },
      {
        hash: 'def5678',
        parents: ['abc1234'],
        t: 1700000100,
        author: 'dependabot[bot]',
        message: 'chore(deps): bump vitest',
        isBot: true,
        changes: [
          {
            path: 'src/renamed.ts',
            from: 'src/café file "1".ts',
            type: 'R',
            add: 2,
            del: 1,
          },
        ],
      },
    ],
  };
}

describe('HISTORY_JSON_SCHEMA_V1', () => {
  it('exposes a JSON Schema Draft 2020-12 schema for version 1', () => {
    expect(HISTORY_JSON_SCHEMA_V1.$schema).toContain('2020-12');
    expect(HISTORY_JSON_SCHEMA_V1.properties.schemaVersion.const).toBe(1);
    expect(HISTORY_JSON_SCHEMA_V1.required).toEqual([
      'schemaVersion',
      'repo',
      'authors',
      'tags',
      'events',
    ]);
  });
});

describe('validateHistory', () => {
  it('accepts a valid schemaVersion 1 history with unicode, spaces, quotes, and renames', () => {
    const history = makeValidHistory();
    const result = validateHistory(history);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.repo.name).toBe('demo-repo');
      expect(result.data.events).toHaveLength(2);
    }
  });

  it('accepts an empty repository history', () => {
    const empty: History = {
      schemaVersion: 1,
      repo: { name: 'empty-repo', head: '' },
      authors: {},
      tags: [],
      events: [],
    };
    const result = validateHistory(empty);
    expect(result.ok).toBe(true);
  });

  it('accepts a single-commit repo with empty changes array', () => {
    const single: History = {
      schemaVersion: 1,
      repo: { name: 'single', head: '1111111' },
      authors: { a: { name: 'A', isBot: false } },
      tags: [],
      events: [
        {
          hash: '1111111',
          parents: [],
          t: 1700000000,
          author: 'a',
          message: 'chore: empty commit',
          isBot: false,
          changes: [],
        },
      ],
    };
    expect(validateHistory(single).ok).toBe(true);
  });

  it('rejects unsupported schemaVersion', () => {
    const bad = { ...makeValidHistory(), schemaVersion: 2 };
    const result = validateHistory(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'schemaVersion')).toBe(true);
    }
  });

  it('rejects rename or copy changes missing the `from` field', () => {
    const bad = makeValidHistory();
    bad.events[1] = {
      ...bad.events[1]!,
      changes: [{ path: 'src/b.ts', type: 'R', add: 0, del: 0 }],
    };
    const result = validateHistory(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('changes[0].from'))).toBe(true);
    }
  });

  it('rejects negative line counts and unknown file change types', () => {
    const bad = makeValidHistory();
    bad.events[0] = {
      ...bad.events[0]!,
      changes: [{ path: 'a.ts', type: 'X' as 'A', add: -5, del: 0 }],
    };
    const result = validateHistory(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('type'))).toBe(true);
      expect(result.errors.some((e) => e.path.includes('add'))).toBe(true);
    }
  });

  it('rejects events referencing an unknown author key', () => {
    const bad = makeValidHistory();
    bad.events[0] = { ...bad.events[0]!, author: 'ghost@example.com' };
    const result = validateHistory(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === 'events[0].author')).toBe(true);
    }
  });

  it('assertValidHistory throws an Error on invalid input', () => {
    expect(() => assertValidHistory(null)).toThrow(/Invalid GitStory history/);
  });
});
