import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { History } from '@gitstory/core';
import { createApp } from '../src/app.js';
import { DiskHistoryCache } from '../src/cache.js';
import { parseGitHubRepoUrl } from '../src/validate-url.js';

const tempDirs: string[] = [];

function makeTempCacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gitstory-server-cache-'));
  tempDirs.push(dir);
  return dir;
}

function makeFakeHistory(name: string): History {
  return {
    schemaVersion: 1,
    repo: { name, head: 'abc1234', defaultBranch: 'main' },
    authors: { a: { name: 'Alice', isBot: false } },
    tags: [],
    events: [
      {
        hash: 'abc1234',
        parents: [],
        t: 1700000000,
        author: 'a',
        message: 'init',
        isBot: false,
        changes: [{ path: 'README.md', type: 'A', add: 10, del: 0 }],
      },
    ],
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('parseGitHubRepoUrl (SSRF / security allowlist)', () => {
  it('accepts valid public GitHub HTTPS URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/hatimbenayad/GitStory')).toEqual({
      owner: 'hatimbenayad',
      repo: 'GitStory',
      canonicalUrl: 'https://github.com/hatimbenayad/GitStory.git',
      slug: 'hatimbenayad__GitStory',
    });
    expect(parseGitHubRepoUrl('https://github.com/org/my-repo.git/')).toEqual({
      owner: 'org',
      repo: 'my-repo',
      canonicalUrl: 'https://github.com/org/my-repo.git',
      slug: 'org__my-repo',
    });
  });

  it('rejects non-GitHub hosts, local paths, SSH URLs, and injection characters', () => {
    expect(parseGitHubRepoUrl('http://127.0.0.1/owner/repo')).toBeNull();
    expect(parseGitHubRepoUrl('file:///etc/passwd')).toBeNull();
    expect(parseGitHubRepoUrl('git@github.com:owner/repo.git')).toBeNull();
    expect(parseGitHubRepoUrl('https://evil.com/owner/repo')).toBeNull();
    expect(parseGitHubRepoUrl('https://github.com/owner/repo;rm -rf /')).toBeNull();
    expect(parseGitHubRepoUrl('https://github.com/owner/..')).toBeNull();
  });
});

describe('GitStory optional Hono backend (U13 / FR-5, FR-27)', () => {
  it('clones, caches, serves shareable repo history, and hits disk cache on repeat requests', async () => {
    const cache = new DiskHistoryCache(makeTempCacheDir());
    let cloneCalls = 0;

    const app = createApp({
      cache,
      cloneAndExtract: async (canonicalUrl, _firstParent) => {
        cloneCalls++;
        expect(canonicalUrl).toBe('https://github.com/demo/project.git');
        return makeFakeHistory('demo/project');
      },
    });

    // Health check
    const health = await app.request('/api/health');
    expect(health.status).toBe(200);

    // Invalid URL rejected with 400
    const bad = await app.request('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' }),
    });
    expect(bad.status).toBe(400);

    // First POST clones & caches
    const first = await app.request('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/demo/project' }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string; cached: boolean; history: History };
    expect(firstBody.cached).toBe(false);
    expect(firstBody.history.repo.name).toBe('demo/project');
    expect(cloneCalls).toBe(1);

    // Second POST hits disk cache without re-cloning
    const second = await app.request('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/demo/project' }),
    });
    const secondBody = (await second.json()) as { id: string; cached: boolean };
    expect(secondBody.cached).toBe(true);
    expect(cloneCalls).toBe(1);

    // GET shareable permalink endpoint returns cached history
    const fetched = await app.request(`/api/repos/${firstBody.id}/history`);
    expect(fetched.status).toBe(200);
    const fetchedHistory = (await fetched.json()) as History;
    expect(fetchedHistory.repo.name).toBe('demo/project');

    // Unknown ID returns 404
    const missing = await app.request('/api/repos/unknown-id/history');
    expect(missing.status).toBe(404);
  });
});
