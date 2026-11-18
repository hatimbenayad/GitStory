# Spec: U10 — IndexedDB Caching & Web Worker Offloading

## 1. Purpose & Why
Parsing large `history.json` files, validating schemas, detecting highlights, and preparing keyframes on the UI thread would freeze the browser. U10 moves heavy ingestion and modeling onto a Web Worker and caches processed results in IndexedDB (`idb`) keyed by repo identity + HEAD + options (`FR-14`) so cached reloads hit the <3s first-frame budget.

## 2. Functional Requirements Covered
- `FR-14`: Cache processed results in IndexedDB keyed by `repoName + head + optionsHash`.
- NFR: Non-blocking UI thread via Web Workers.

## 3. Behavior & Contracts
- **Cache Key:** `makeHistoryCacheKey({ repoName, head, options })` produces a stable deterministic string.
- **IndexedDB Store (`gitstory-cache-v1`):** Stores `{ key, savedAt, history, chapters, highlights }` with LRU eviction (e.g., keep latest 10 repos or max ~50 MB) and transparent in-memory fallback when `indexedDB` is unavailable (private browsing / Node tests).
- **Web Worker (`historyWorker.ts`):** Handles `{ type: 'process', rawJson?: string, history?: History, largeRepoOptions }` -> validates, applies large-repo aggregation if needed, detects highlights & chapters, and responds with `{ type: 'result', ... }` or `{ type: 'error', message }`. Falls back cleanly to async main-thread execution if `Worker` is unavailable.
