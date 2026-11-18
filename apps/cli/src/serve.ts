import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { History } from '@gitstory/core';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
};

export interface ServeHistoryOptions {
  history: History;
  port?: number;
  webDistDir?: string;
}

export function resolveDefaultWebDistDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../web/dist'),
    resolve(here, '../../../apps/web/dist'),
    resolve(process.cwd(), 'apps/web/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

/**
 * Starts a local HTTP server serving `/api/history.json` and the built GitStory web app (`FR-2`).
 */
export async function startLocalServer(
  options: ServeHistoryOptions,
): Promise<{ server: Server; url: string; port: number }> {
  const port = options.port ?? 4173;
  const webDir = options.webDistDir ?? resolveDefaultWebDistDir();
  const payload = JSON.stringify(options.history);

  const server = createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (pathname === '/api/history.json') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(payload);
      return;
    }

    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, repo: options.history.repo.name }));
      return;
    }

    if (!webDir) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;background:#0b1020;color:#e2e8f0"><h1>GitStory Local Server</h1><p>History is available at <a style="color:#38bdf8" href="/api/history.json">/api/history.json</a>.</p><p>Build the web app (<code>pnpm --filter @gitstory/web build</code>) to serve the full interactive player here.</p></body></html>`,
      );
      return;
    }

    const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = resolve(webDir, safeRel);
    const resolvedWebDir = resolve(webDir);

    // Prevent directory traversal outside webDir
    if (!candidate.startsWith(resolvedWebDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const filePath =
      existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : join(resolvedWebDir, 'index.html');

    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(filePath));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => resolveListen());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    server,
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
  };
}
