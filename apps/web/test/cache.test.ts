import { describe, expect, it } from 'vitest';
import { HistoryCache, makeHistoryCacheKey } from '../src/lib/historyCache.js';
import { processHistoryAsync } from '../src/lib/historyProcessor.js';
import { createSampleHistory } from '../src/lib/sampleHistory.js';

describe('HistoryCache & historyProcessor (U10)', () => {
  it('produces deterministic cache keys from repo identity, HEAD, and options (FR-14)', () => {
    const k1 = makeHistoryCacheKey({
      repoName: 'demo',
      head: 'abc1234',
      options: { granularity: 'auto', maxDepth: 4 },
    });
    const k2 = makeHistoryCacheKey({
      repoName: 'demo',
      head: 'abc1234',
      options: { maxDepth: 4, granularity: 'auto' },
    });
    const k3 = makeHistoryCacheKey({
      repoName: 'demo',
      head: 'def5678',
      options: { granularity: 'auto', maxDepth: 4 },
    });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it('stores, retrieves, and LRU-evicts processed history entries', async () => {
    const cache = new HistoryCache({ maxEntries: 2 });
    const h = createSampleHistory();
    await cache.set('k1', { history: h, chapters: [], highlights: [] });
    await cache.set('k2', { history: h, chapters: [], highlights: [] });
    expect(await cache.get('k1')).not.toBeNull();

    // Adding k3 should evict oldest entry
    await cache.set('k3', { history: h, chapters: [], highlights: [] });
    expect(await cache.size()).toBe(2);
    expect(await cache.get('k3')).not.toBeNull();
  });

  it('processes history via worker/fallback and hits cache on second load', async () => {
    const cache = new HistoryCache();
    const sample = createSampleHistory();

    const first = await processHistoryAsync(sample, { cache });
    expect(first.fromCache).toBe(false);
    expect(first.chapters.length).toBe(3);
    expect(first.highlights.length).toBeGreaterThan(0);

    const second = await processHistoryAsync(sample, { cache });
    expect(second.fromCache).toBe(true);
    expect(second.chapters).toEqual(first.chapters);
  });
});
