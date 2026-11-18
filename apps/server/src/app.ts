import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { History } from '@gitstory/core';
import { extractHistory } from '@gitstory/extractor';
import { DiskHistoryCache } from './cache.js';
import { parseGitHubRepoUrl } from './validate-url.js';

const execFileAsync = promisify(execFile);

export interface ServerDeps {
  cache: DiskHistoryCache;
  corsOrigin?: string;
  cloneAndExtract?: (canonicalUrl: string, firstParent: boolean, repoName: string) => Promise<History>;
}

/**
 * Performs a read-only partial blobless clone (`--filter=blob:none --no-checkout`) into a temp
 * directory, extracts `History`, and removes the temporary clone immediately (`FR-5`).
 */
export async function defaultCloneAndExtract(
  canonicalUrl: string,
  firstParent: boolean,
  repoName: string,
): Promise<History> {
  const workDir = mkdtempSync(join(tmpdir(), 'gitstory-clone-'));
  try {
    await execFileAsync(
      'git',
      ['clone', '--filter=blob:none', '--no-checkout', '--quiet', canonicalUrl, workDir],
      {
        timeout: 120_000,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
    );
    return await extractHistory({
      repoPath: workDir,
      firstParent,
      repoName,
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Creates the optional GitStory Hono API app (`FR-5`, `FR-27`).
 */
export function createApp(deps: ServerDeps): Hono {
  const app = new Hono();
  const cloneFn = deps.cloneAndExtract ?? defaultCloneAndExtract;

  app.use(
    '/api/*',
    cors({
      origin: deps.corsOrigin ?? '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  app.get('/api/health', (c) => c.json({ ok: true, service: 'gitstory-server' }));

  app.post('/api/repos', async (c) => {
    let body: { url?: unknown; firstParent?: unknown };
    try {
      body = (await c.req.json()) as { url?: unknown; firstParent?: unknown };
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    if (typeof body.url !== 'string') {
      return c.json({ error: 'Missing "url" string field' }, 400);
    }

    const parsed = parseGitHubRepoUrl(body.url);
    if (!parsed) {
      return c.json(
        { error: 'Only public GitHub HTTPS URLs (https://github.com/owner/repo) are allowed' },
        400,
      );
    }

    const firstParent = body.firstParent !== false;
    const id = `${parsed.slug}-${firstParent ? 'fp' : 'full'}`;

    const cached = deps.cache.get(id);
    if (cached) {
      return c.json({ id, cached: true, history: cached });
    }

    try {
      const history = await cloneFn(
        parsed.canonicalUrl,
        firstParent,
        `${parsed.owner}/${parsed.repo}`,
      );
      deps.cache.set(id, history);
      return c.json({ id, cached: false, history });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clone repository';
      return c.json({ error: `Could not extract repository: ${msg}` }, 502);
    }
  });

  app.get('/api/repos/:id/history', (c) => {
    const id = c.req.param('id');
    const cached = deps.cache.get(id);
    if (!cached) {
      return c.json({ error: 'Repository snapshot not found in cache' }, 404);
    }
    return c.json(cached);
  });

  return app;
}
