import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Chapter, Highlight, History } from '@gitstory/core';

export interface CachedHistoryPayload {
  history: History;
  chapters: Chapter[];
  highlights: Highlight[];
}

interface StoredRecord extends CachedHistoryPayload {
  key: string;
  savedAt: number;
}

interface GitStoryDB extends DBSchema {
  histories: {
    key: string;
    value: StoredRecord;
    indexes: { 'by-savedAt': number };
  };
}

const DB_NAME = 'gitstory-cache-v1';
const STORE_NAME = 'histories';

/**
 * Generates a deterministic cache key from repo identity, HEAD, and processing options (`FR-14`).
 */
export function makeHistoryCacheKey(input: {
  repoName: string;
  head: string;
  options?: Record<string, unknown>;
}): string {
  const opts = input.options ?? {};
  const sortedEntries = Object.keys(opts)
    .sort()
    .map((k) => `${k}=${JSON.stringify(opts[k])}`)
    .join('&');
  return `v1::${input.repoName}::${input.head}::${sortedEntries}`;
}

/**
 * IndexedDB-backed processed history cache with LRU eviction and graceful
 * in-memory fallback when `indexedDB` is unavailable (`FR-14`).
 */
export class HistoryCache {
  private readonly maxEntries: number;
  private readonly memoryFallback = new Map<string, StoredRecord>();
  private dbPromise: Promise<IDBPDatabase<GitStoryDB> | null> | null = null;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 10);
  }

  private getDb(): Promise<IDBPDatabase<GitStoryDB> | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = openDB<GitStoryDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('by-savedAt', 'savedAt');
        }
      },
    }).catch(() => null);

    return this.dbPromise;
  }

  async get(key: string): Promise<CachedHistoryPayload | null> {
    const db = await this.getDb();
    if (!db) {
      const hit = this.memoryFallback.get(key);
      if (!hit) return null;
      hit.savedAt = Date.now();
      return { history: hit.history, chapters: hit.chapters, highlights: hit.highlights };
    }

    try {
      const record = await db.get(STORE_NAME, key);
      if (!record) return null;
      return {
        history: record.history,
        chapters: record.chapters,
        highlights: record.highlights,
      };
    } catch {
      return null;
    }
  }

  async set(key: string, payload: CachedHistoryPayload): Promise<void> {
    const record: StoredRecord = {
      key,
      savedAt: Date.now(),
      ...payload,
    };

    const db = await this.getDb();
    if (!db) {
      this.memoryFallback.delete(key);
      this.memoryFallback.set(key, record);
      while (this.memoryFallback.size > this.maxEntries) {
        const oldestKey = this.memoryFallback.keys().next().value;
        if (oldestKey !== undefined) {
          this.memoryFallback.delete(oldestKey);
        } else {
          break;
        }
      }
      return;
    }

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.put(record);
      const all = await tx.store.index('by-savedAt').getAllKeys();
      if (all.length > this.maxEntries) {
        const toDelete = all.slice(0, all.length - this.maxEntries);
        for (const oldKey of toDelete) {
          await tx.store.delete(oldKey);
        }
      }
      await tx.done;
    } catch {
      // Ignore storage quota errors gracefully
    }
  }

  async size(): Promise<number> {
    const db = await this.getDb();
    if (!db) return this.memoryFallback.size;
    try {
      return await db.count(STORE_NAME);
    } catch {
      return 0;
    }
  }
}

export const defaultHistoryCache = new HistoryCache();
