import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHistory } from '@gitstory/core';
import { extractHistory } from '../src/index.js';

const tempDirs: string[] = [];

function createTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gitstory-fixture-'));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Alice'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'alice@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  return dir;
}

function git(dir: string, args: string[], env?: Record<string, string>): void {
  execFileSync('git', args, {
    cwd: dir,
    env: { ...process.env, ...env },
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('extractHistory integration (fixture git repos)', () => {
  it('handles an empty repository with no commits gracefully', async () => {
    const dir = createTempRepo();
    const history = await extractHistory({ repoPath: dir });
    expect(validateHistory(history).ok).toBe(true);
    expect(history.events).toEqual([]);
    expect(history.tags).toEqual([]);
    expect(history.repo.head).toBe('');
  });

  it('extracts renames, deletions, binary files, weird filenames, .mailmap, bots, tags, and first-parent vs full history', async () => {
    const dir = createTempRepo();

    // Commit 1: Initial + .mailmap + unicode/space filename + binary file
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, '.mailmap'),
      'Alice Canonical <alice@example.com> <alice.alias@old.dev>\n',
    );
    writeFileSync(join(dir, 'src/hello café.ts'), 'export const a = 1;\nexport const b = 2;\n');
    writeFileSync(join(dir, 'icon.bin'), Buffer.from([0x00, 0xff, 0x10, 0x00, 0x42]));
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'feat: initial scaffold'], {
      GIT_AUTHOR_DATE: '1700000000 +0000',
      GIT_COMMITTER_DATE: '1700000000 +0000',
    });
    git(dir, ['tag', '-a', 'v0.1.0', '-m', 'Release 0.1.0'], {
      GIT_COMMITTER_DATE: '1700000050 +0000',
    });

    // Commit 2: Author alias (should merge via .mailmap) + rename file
    git(dir, ['mv', 'src/hello café.ts', 'src/core.ts']);
    writeFileSync(
      join(dir, 'src/core.ts'),
      'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
    );
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'refactor: rename hello to core'], {
      GIT_AUTHOR_NAME: 'Old Alice',
      GIT_AUTHOR_EMAIL: 'alice.alias@old.dev',
      GIT_AUTHOR_DATE: '1700003600 +0000',
      GIT_COMMITTER_DATE: '1700003600 +0000',
    });

    // Feature branch with 2 commits merged with --no-ff
    git(dir, ['checkout', '-b', 'feat/branch']);
    writeFileSync(join(dir, 'src/feature.ts'), 'export const feat = true;\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'feat: add feature part 1'], {
      GIT_AUTHOR_DATE: '1700007200 +0000',
      GIT_COMMITTER_DATE: '1700007200 +0000',
    });
    writeFileSync(join(dir, 'src/feature.ts'), 'export const feat = true;\nexport const v = 2;\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'feat: add feature part 2'], {
      GIT_AUTHOR_DATE: '1700010800 +0000',
      GIT_COMMITTER_DATE: '1700010800 +0000',
    });

    git(dir, ['checkout', 'main']);
    git(dir, ['merge', '--no-ff', 'feat/branch', '-m', 'Merge branch feat/branch'], {
      GIT_AUTHOR_DATE: '1700014400 +0000',
      GIT_COMMITTER_DATE: '1700014400 +0000',
    });

    // Bot commit deleting binary file
    unlinkSync(join(dir, 'icon.bin'));
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-m', 'chore(deps): bot cleanup'], {
      GIT_AUTHOR_NAME: 'dependabot[bot]',
      GIT_AUTHOR_EMAIL: 'dependabot[bot]@users.noreply.github.com',
      GIT_AUTHOR_DATE: '1700018000 +0000',
      GIT_COMMITTER_DATE: '1700018000 +0000',
    });
    git(dir, ['tag', 'v0.2.0']);

    // First-parent mode (default): 4 commits (init, rename, merge, bot)
    const fpHistory = await extractHistory({ repoPath: dir, firstParent: true });
    expect(validateHistory(fpHistory).ok).toBe(true);
    expect(fpHistory.events).toHaveLength(4);
    expect(fpHistory.tags.map((t) => t.name)).toEqual(['v0.1.0', 'v0.2.0']);

    // Mailmap merged alice.alias@old.dev into alice@example.com
    expect(fpHistory.events[0]!.author).toBe('alice@example.com');
    expect(fpHistory.events[1]!.author).toBe('alice@example.com');
    expect(fpHistory.authors['alice@example.com']?.name).toBe('Alice Canonical');

    // Rename preserved
    const renameChange = fpHistory.events[1]!.changes.find((c) => c.type === 'R');
    expect(renameChange).toBeDefined();
    expect(renameChange?.from).toBe('src/hello café.ts');
    expect(renameChange?.path).toBe('src/core.ts');

    // Merge commit in first-parent mode includes net added file from branch
    expect(fpHistory.events[2]!.changes.some((c) => c.path === 'src/feature.ts')).toBe(true);

    // Bot commit flagged & delete recorded
    expect(fpHistory.events[3]!.isBot).toBe(true);
    expect(fpHistory.events[3]!.changes).toContainEqual({
      path: 'icon.bin',
      type: 'D',
      add: 0,
      del: 0,
    });

    // Full-history mode includes the 2 branch commits too -> 6 commits
    const fullHistory = await extractHistory({ repoPath: dir, firstParent: false });
    expect(validateHistory(fullHistory).ok).toBe(true);
    expect(fullHistory.events).toHaveLength(6);
  });

  it('handles detached HEAD cleanly', async () => {
    const dir = createTempRepo();
    writeFileSync(join(dir, 'a.txt'), 'hello\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'init']);
    git(dir, ['checkout', '--detach', 'HEAD']);

    const history = await extractHistory({ repoPath: dir });
    expect(validateHistory(history).ok).toBe(true);
    expect(history.events).toHaveLength(1);
    expect(history.repo.head).toMatch(/^[0-9a-f]{40}$/);
  });
});
