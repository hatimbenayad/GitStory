import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHistory } from '@gitstory/core';
import { runCli } from '../src/cli.js';
import { startLocalServer } from '../src/serve.js';

const tempDirs: string[] = [];

function createFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gitstory-cli-'));
  tempDirs.push(dir);
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), '# Hello\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('gitstory CLI', () => {
  it('writes a schema-valid history.json file for a local repo (FR-1)', async () => {
    const repoDir = createFixtureRepo();
    const outFile = join(repoDir, 'out-history.json');

    const exitCode = await runCli([repoDir, '-o', outFile]);
    expect(exitCode).toBe(0);

    const parsed: unknown = JSON.parse(readFileSync(outFile, 'utf8'));
    const validation = validateHistory(parsed);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.data.events).toHaveLength(1);
    }
  });

  it('serves /api/history.json on localhost (FR-2)', async () => {
    const repoDir = createFixtureRepo();
    const outFile = join(repoDir, 'h.json');
    await runCli([repoDir, '-o', outFile]);
    const history = validateHistory(JSON.parse(readFileSync(outFile, 'utf8')));
    expect(history.ok).toBe(true);
    if (!history.ok) return;

    const { server, url } = await startLocalServer({ history: history.data, port: 0 });
    try {
      const res = await fetch(`${url}/api/history.json`);
      expect(res.status).toBe(200);
      const body: unknown = await res.json();
      expect(validateHistory(body).ok).toBe(true);
    } finally {
      server.close();
    }
  });

  it('computes architecture dependency diff between two refs via `gitstory arch` (FR-24)', async () => {
    const repoDir = createFixtureRepo();
    writeFileSync(join(repoDir, 'a.ts'), 'export const x = 1;\n');
    writeFileSync(join(repoDir, 'index.ts'), "import { x } from './a.js';\nexport const y = x;\n");
    execFileSync('git', ['add', '.'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'v1'], { cwd: repoDir });
    execFileSync('git', ['tag', 'v1'], { cwd: repoDir });

    writeFileSync(join(repoDir, 'b.ts'), 'export const z = 2;\n');
    writeFileSync(
      join(repoDir, 'index.ts'),
      "import { x } from './a.js';\nimport { z } from './b.js';\nexport const y = x + z;\n",
    );
    execFileSync('git', ['add', '.'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'v2'], { cwd: repoDir });
    execFileSync('git', ['tag', 'v2'], { cwd: repoDir });

    const outPath = join(repoDir, 'arch-diff.json');
    const code = await runCli(['arch', repoDir, 'v1', 'v2', '-o', outPath]);
    expect(code).toBe(0);

    const diff = JSON.parse(readFileSync(outPath, 'utf8')) as {
      summary: { addedNodes: number; changedNodes: number };
    };
    expect(diff.summary.addedNodes).toBe(1);
    expect(diff.summary.changedNodes).toBe(1);
  });
});
