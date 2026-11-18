import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { History } from '@gitstory/core';

const SAFE_ID_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Simple disk-backed JSON cache for extracted public repositories (`FR-5`, `FR-27`).
 */
export class DiskHistoryCache {
  private readonly dir: string;

  constructor(cacheDir: string) {
    this.dir = resolve(cacheDir);
    mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(id: string): string | null {
    if (!SAFE_ID_RE.test(id) || id.includes('..')) return null;
    const candidate = resolve(this.dir, `${id}.json`);
    if (!candidate.startsWith(this.dir)) return null;
    return candidate;
  }

  get(id: string): History | null {
    const p = this.fileFor(id);
    if (!p || !existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as History;
    } catch {
      return null;
    }
  }

  set(id: string, history: History): void {
    const p = this.fileFor(id);
    if (!p) return;
    writeFileSync(p, JSON.stringify(history), 'utf8');
  }
}

export function defaultCacheDir(): string {
  return join(process.cwd(), '.gitstory-cache');
}
