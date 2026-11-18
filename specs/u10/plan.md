# Plan: U10 — IndexedDB Caching & Web Worker Offloading

## 1. Technical Approach
- Add `idb` to `apps/web`.
- Create `apps/web/src/lib/historyCache.ts` with a clean `HistoryCache` abstraction backed by `idb` (with automatic `Map` fallback if `indexedDB` is undefined or throws `SecurityError`).
- Create `apps/web/src/workers/history.worker.ts` (Vite native `new Worker(new URL(..., import.meta.url), { type: 'module' })`) and a typed promise wrapper `apps/web/src/lib/historyProcessor.ts`.
- Integrate cache check + worker processing + non-blocking loading indicator into `useStoryStore`.
