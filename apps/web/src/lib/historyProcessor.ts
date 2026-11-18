import {
  buildChapters,
  detectHighlights,
  validateHistory,
  type Chapter,
  type Highlight,
  type History,
} from '@gitstory/core';
import {
  defaultHistoryCache,
  makeHistoryCacheKey,
  type HistoryCache,
} from './historyCache.js';

export interface ProcessedHistoryResult {
  history: History;
  chapters: Chapter[];
  highlights: Highlight[];
  fromCache: boolean;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  history?: History;
  chapters?: Chapter[];
  highlights?: Highlight[];
  error?: string;
}

let workerSeq = 1;

function extractQuickKey(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const repo = r.repo as Record<string, unknown> | undefined;
  if (repo && typeof repo.name === 'string' && typeof repo.head === 'string' && repo.head.length > 0) {
    return makeHistoryCacheKey({ repoName: repo.name, head: repo.head });
  }
  return null;
}

async function runInWorkerOrFallback(
  raw: unknown,
): Promise<{ history: History; chapters: Chapter[]; highlights: Highlight[] }> {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('../workers/history.worker.ts', import.meta.url), {
        type: 'module',
      });
      const id = workerSeq++;
      return await new Promise((resolve, reject) => {
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          if (ev.data.id !== id) return;
          worker.terminate();
          if (ev.data.ok && ev.data.history) {
            resolve({
              history: ev.data.history,
              chapters: ev.data.chapters ?? [],
              highlights: ev.data.highlights ?? [],
            });
          } else {
            reject(new Error(ev.data.error ?? 'Worker processing failed'));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          reject(new Error(err.message || 'Worker error'));
        };
        worker.postMessage({ id, raw });
      });
    } catch {
      // Fall back to main thread if Worker instantiation is blocked (e.g., restricted CSP/Node)
    }
  }

  const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  const validated = validateHistory(parsed);
  if (!validated.ok) {
    const msg = validated.errors
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join(' | ');
    throw new Error(`Invalid history.json: ${msg}`);
  }
  const history = validated.data;
  return {
    history,
    chapters: buildChapters(history),
    highlights: detectHighlights(history),
  };
}

/**
 * Checks IndexedDB cache first (`FR-14`), otherwise validates & analyzes the history off-thread
 * inside a Web Worker and stores the result in IndexedDB.
 */
export async function processHistoryAsync(
  raw: unknown,
  options: { cache?: HistoryCache; cacheOptions?: Record<string, unknown> } = {},
): Promise<ProcessedHistoryResult> {
  const cache = options.cache ?? defaultHistoryCache;
  const quickKey = extractQuickKey(raw);

  if (quickKey) {
    const cached = await cache.get(quickKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  const processed = await runInWorkerOrFallback(raw);
  const key = makeHistoryCacheKey({
    repoName: processed.history.repo.name,
    head: processed.history.repo.head,
    ...(options.cacheOptions ? { options: options.cacheOptions } : {}),
  });

  if (processed.history.repo.head.length > 0) {
    await cache.set(key, processed);
  }

  return { ...processed, fromCache: false };
}
