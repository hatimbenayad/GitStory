# GitStory Unit Decomposition

This document decomposes the GitStory Intent into **15 independently deliverable Units**, following the recommended delivery order:

- **MVP (Phase 1):** `U1 → U2 → U3 → U4 → U5 → U6`
- **Documentary & Performance (Phase 2):** `U7 → U10 → U8 → U9 → U11`
- **Export, Sharing & Backend (Phase 3):** `U12 → U13`
- **Architecture Comparison v2 & Narration (Phase 4):** `U14`
- **Operations, CI, Docs & Demo (Phase 5):** `U15`

---

## U1 — Core Types & `history.json` Schema
- **Target:** `packages/core` (plus monorepo scaffold: pnpm workspace, TypeScript strict config, ESLint, Prettier, Vitest)
- **Purpose:** Define the canonical TypeScript types (`History`, `CommitEvent`, `FileChange`, `AuthorInfo`, `TagInfo`, `Highlight`, `Chapter`, `NarrationProvider`), JSON Schema v1, runtime validator, and sanitization/normalization utilities.
- **FRs:** Foundation for `FR-1`, `FR-3`, `FR-6`, `FR-15`, `FR-28`.
- **Inputs:** Untrusted JSON payloads or typed builder inputs.
- **Outputs:** Exported types, JSON Schema v1 object/file, `validateHistory()` returning typed result or structured validation errors, path normalizer.
- **Dependencies:** None.
- **Definition of Done:** Strict typecheck, lint, unit tests covering valid/invalid payloads, edge cases (empty repo, unicode paths, schema mismatch), and exported JSON Schema.

## U2 — Git Extractor & CLI `history.json` Output
- **Target:** `packages/extractor`, `apps/cli`
- **Purpose:** Stream-parse `git log` from local repositories with `.mailmap`, bot detection, tags, `-M -C` rename/copy detection, first-parent/full-history toggle, and provide the `gitstory` CLI (`extract` and `serve`).
- **FRs:** `FR-1`, `FR-2`, `FR-6`, `FR-7`, `FR-8`, `FR-9`, `FR-10`, `FR-11`, `FR-12`.
- **Inputs:** Local filesystem path to a Git repository + extraction options (`firstParent`, `output`, `port`).
- **Outputs:** Schema-valid `history.json` file (or stream) and optional local HTTP server serving the web app preloaded with the history.
- **Dependencies:** `U1`.
- **Definition of Done:** Programmatically generated fixture repo tests (renames, copies, deletions, merges, tags, `.mailmap`, bots, binary files, unicode/spaces/quotes, empty & single-commit repos, detached HEAD), streaming memory check, CLI executable working end-to-end.

## U3 — State Replay Engine & Keyframes
- **Target:** `packages/core`
- **Purpose:** Deterministically replay `CommitEvent[]` into an evolving file-tree state (`RepoState`) and precompute immutable keyframes every `N` events for O(1)/O(N) instant scrubbing.
- **FRs:** `FR-13`.
- **Inputs:** Validated `History` + keyframe interval `N` (default 100).
- **Outputs:** `ReplayEngine` exposing `getStateAt(index)`, `stepForward()`, `getKeyframeCount()`, file/dir tree, running totals (files, lines, contributors, language/extension breakdown).
- **Dependencies:** `U1`.
- **Definition of Done:** Unit + property-style tests proving `getStateAt(k)` after arbitrary forward/backward scrubs equals fresh replay `0..k` for every `k`, including renames, copies, deletions, empty directories pruning, and edge cases.

## U4 — Timeline Engine (Virtual Clock, Adaptive Pacing & Scrubbing)
- **Target:** `packages/timeline`
- **Purpose:** Provide a deterministic virtual-clock timeline mapping wall/playback time to commit indices with adaptive documentary pacing (compressing dead gaps, lingering on highlights) and constant-speed mode, plus chapter navigation.
- **FRs:** `FR-20`, `FR-21`.
- **Inputs:** `History` events, `Chapter[]`, `Highlight[]`, playback config (`mode: 'adaptive' | 'constant'`, `speed`, `targetDurationSec`).
- **Outputs:** `TimelineEngine` supporting `play()`, `pause()`, `tick(dtMs)`, `seekToIndex(i)`, `seekToTime(t)`, `jumpToChapter(nameOrIndex)`, `setSpeed()`, `setPacingMode()`, and deterministic frame stepping for export.
- **Dependencies:** `U1`, `U3`.
- **Definition of Done:** Unit tests verifying gap compression, highlight slow-down, monotonic time-to-index mapping, exact seek/scrub, chapter jump, pause/resume, and deterministic export stepping.

## U5 — Replay Renderer (PixiJS Stable File-Tree View)
- **Target:** `packages/layout`, `apps/web` (renderer component)
- **Purpose:** Compute stable, deterministic radial/hierarchical file-tree layouts (using `d3-hierarchy`) and render them smoothly via PixiJS (WebGL with Canvas fallback) showing file creation, modification flash, rename glide, and deletion fade.
- **FRs:** `FR-16`, `FR-22`.
- **Inputs:** `RepoState`, active `CommitEvent` delta, viewport dimensions, theme/accessibility options (`reducedMotion`, `colorblindSafe`, `hideBots`).
- **Outputs:** Pure layout engine (`TreeLayoutEngine`) producing stable `(x, y)` coordinates + PixiJS `ReplayCanvas` renderer with pan/zoom, hover tooltips, and `renderAt(time)` deterministic frame draw for export.
- **Dependencies:** `U3`, `U4`.
- **Definition of Done:** Layout stability tests verifying unchanged nodes do not jump across commits, WebGL/Canvas renderer builds cleanly, renders fixture history smoothly at 60 fps target, respects reduced-motion and colorblind palettes.

## U6 — Web App Shell, Ingestion, Overlays & Controls
- **Target:** `apps/web`, `apps/cli` (serve wiring)
- **Purpose:** Assemble the complete local-first React + Vite + Zustand web application: landing/dropzone (`history.json`, File System Access API local folder with graceful fallback, built-in sample/demo loader, CLI preloaded `/api/history.json`), HUD overlay, timeline scrubber & chapter bar, keyboard shortcuts, accessibility controls, and shareable state URLs.
- **FRs:** `FR-2`, `FR-3`, `FR-4`, `FR-19`, `FR-20`, `FR-27` (static permalink).
- **Inputs:** `history.json` drop/upload, local directory handle, `/api/history.json`, or URL hash/query params.
- **Outputs:** Working SPA runnable via `pnpm dev` and `gitstory serve <path>`.
- **Dependencies:** `U2`, `U4`, `U5`.
- **Definition of Done:** App builds cleanly, all controls keyboard-accessible with ARIA labels, untrusted repo strings escaped, Playwright E2E smoke test loads fixture `history.json`, plays, scrubs, and verifies HUD updates.

## U7 — Highlight Detection, Chapters & Optional Narration
- **Target:** `packages/core`
- **Purpose:** Detect documentary highlights (largest commits, new top-level directories, contributor surges, tag/release moments, mass deletions/refactors), build tag chapters, and provide the opt-in `NarrationProvider` interface (disabled by default, with a zero-network local template provider).
- **FRs:** `FR-9`, `FR-15`, `FR-28`.
- **Inputs:** `History` + optional `ReplayEngine` summaries.
- **Outputs:** `detectHighlights(history)`, `buildChapters(history)`, `TemplateNarrationProvider` (opt-in, no API keys).
- **Dependencies:** `U1`, `U2`, `U3`.
- **Definition of Done:** Unit tests verifying all 5 highlight types, deterministic scoring/ranking, empty/tagless repos, and narration interface disabled by default with zero network calls.

## U8 — Treemap View
- **Target:** `packages/layout`, `apps/web`
- **Purpose:** Compute animated squarified treemaps (`d3-treemap`) from `RepoState` and render smooth transitions showing file/directory line sizes over time.
- **FRs:** `FR-17`.
- **Inputs:** `RepoState`, viewport size, color palette, bot/filter settings.
- **Outputs:** `computeTreemapLayout(state, width, height)` + React/Canvas2D `TreemapView` component synchronized with `TimelineEngine`.
- **Dependencies:** `U3`, `U6`.
- **Definition of Done:** Layout unit tests (non-overlapping rects within bounds, stable sorting, zero-line files handled), integrated into web app view switcher, verified in Playwright E2E.

## U9 — Contributor View & Streamgraph
- **Target:** `packages/layout`, `apps/web`
- **Purpose:** Visualize contributor activity with avatars/markers gravitating toward files they modify alongside an interactive stacked streamgraph of contributor activity over time, with bot dimming/hiding.
- **FRs:** `FR-18`, `FR-8`.
- **Inputs:** `History`, `RepoState`, current commit index, `hideBots` / `dimBots` toggle, colorblind palette toggle.
- **Outputs:** `computeContributorSeries(history)` + `ContributorView` (active contributor canvas + synced streamgraph).
- **Dependencies:** `U3`, `U6`.
- **Definition of Done:** Unit tests for contributor time-bucket aggregation and bot filtering, integrated into view switcher, verified in Playwright E2E.

## U10 — IndexedDB Caching & Web Worker Offloading
- **Target:** `apps/web`
- **Purpose:** Cache parsed/processed histories in IndexedDB (via `idb`) keyed by `(repoName, head, optionsHash)` and offload JSON validation, replay keyframe indexing, highlight detection, and layout prep to a dedicated Web Worker so the main thread never blocks.
- **FRs:** `FR-14`, NFR (non-blocking UI, < 3s cached load).
- **Inputs:** Raw `History` or file bytes + cache key.
- **Outputs:** `HistoryCache` (IndexedDB wrapper with graceful fallback when IndexedDB is unavailable) + `historyWorker` RPC client.
- **Dependencies:** `U3`, `U7`, `U6`.
- **Definition of Done:** Unit tests for cache key generation, hit/miss/eviction (with fake/memory fallback in Node tests), worker message protocol, and UI integration with loading progress.

## U11 — Large-Repo Strategy (Sampling, Aggregation & Caps)
- **Target:** `packages/core`, `packages/layout`, `apps/web`
- **Purpose:** Keep 5k–50k+ commit repositories smooth by aggregating dense commits into day/week buckets, collapsing deep directories beyond `maxDepth`, and enforcing a configurable visible node cap (`maxNodes`).
- **FRs:** `FR-23`.
- **Inputs:** `History` + `LargeRepoOptions` (`auto`, `granularity: 'commit' | 'day' | 'week'`, `maxDepth`, `maxNodes`).
- **Outputs:** `aggregateHistory(history, options)` preserving tags/totals, `collapseState(state, maxDepth, maxNodes)`, UI controls/badge, and synthetic 5k+ / 10k-commit benchmark script.
- **Dependencies:** `U7`, `U10`.
- **Definition of Done:** Unit tests proving aggregated histories preserve final file state & tags, node cap never exceeded, benchmark script run on 5k+ synthetic commits with results recorded in `docs/progress.md`.

## U12 — Video & GIF Exporter
- **Target:** `packages/exporter`, `apps/web`
- **Purpose:** Export deterministic animations from the virtual clock as MP4 (WebCodecs `VideoEncoder` + `mp4-muxer`, with `ffmpeg.wasm` / fallback path) or animated GIF (lightweight pure-TS GIF encoder) with resolution/FPS/duration controls, live progress, and cancelation.
- **FRs:** `FR-26`.
- **Inputs:** Render callback `(index, progress) => HTMLCanvasElement | OffscreenCanvas`, `ExportOptions` (`format: 'mp4' | 'gif'`, `width`, `height`, `fps`, `durationSec`), `AbortSignal`.
- **Outputs:** `Blob` (`video/mp4` or `image/gif`), progress callback, clean cancellation.
- **Dependencies:** `U4`, `U5`, `U6`.
- **Definition of Done:** Unit tests for GIF encoder (valid `GIF89a` header/frames), MP4 muxer integration/capability detection, cancelation via `AbortSignal`, Export modal in web app, and Playwright E2E export smoke test.

## U13 — Optional Thin Backend (GitHub URL Clone, Cache & Share Links)
- **Target:** `apps/server`, `apps/web`
- **Purpose:** Provide an optional Node + Hono service that validates public GitHub repo URLs, runs read-only blobless clones (`git clone --filter=blob:none --no-checkout`), extracts `history.json` via `packages/extractor`, caches results on disk, and serves shareable repo slugs.
- **FRs:** `FR-5`, `FR-27`.
- **Inputs:** `POST /api/repos` (`{ url, firstParent }`), `GET /api/repos/:id/history`.
- **Outputs:** Cached `History` JSON + shareable ID/link.
- **Dependencies:** `U2`, `U6`.
- **Definition of Done:** Strict URL allowlist validation (prevents SSRF/command injection), disk cache hit/miss tests, Hono route unit tests, optional GitHub URL tab in web app that degrades gracefully when backend is absent.

## U14 — Architecture Comparison (v2, tree-sitter WASM)
- **Target:** `packages/layout` (or `packages/core` graph module + `apps/web` + `apps/cli`)
- **Purpose:** Compare two refs (`refA`, `refB`) by extracting TypeScript/JavaScript and Python import/dependency graphs via `web-tree-sitter` (with clean fallback parser when WASM grammars aren't loaded) and rendering side-by-side or diff overlay (added green, removed red, changed amber).
- **FRs:** `FR-24`, `FR-25`.
- **Inputs:** Two file trees / refs (`refA`, `refB`) from CLI `gitstory arch <path> <refA> <refB>` or precomputed `ArchDiff` JSON in web app.
- **Outputs:** `ArchGraph`, `ArchDiff` (`added`, `removed`, `changed`, `unchanged` nodes & edges), interactive Architecture Diff view in web app.
- **Dependencies:** `U2`, `U3`, `U6`.
- **Definition of Done:** Unit tests parsing TS/JS and Python imports into module graphs, diff classification tests (added/removed/changed), CLI `arch` subcommand extracting two refs from a fixture git repo, and web UI diff view with side-by-side & overlay toggle.

## U15 — Operations: CI, Deploy Config, Documentation & Self-History Demo
- **Target:** `.github/workflows/`, `README.md`, `CONTRIBUTING.md`, `docs/runbook.md`, `docs/demo/`, `apps/cli/package.json`
- **Purpose:** Productionize the repository with GitHub Actions CI (install, lint, typecheck, test, build), static web app deployment config (GitHub Pages workflow + Vercel config), publish-ready CLI packaging, comprehensive docs, and a real demo GIF/MP4 generated by running GitStory on this repository itself.
- **FRs:** Section 3.3 & Section 10 Success Criteria.
- **Inputs:** Completed U1–U14 codebase and its own Git history.
- **Outputs:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`, `CONTRIBUTING.md`, `docs/runbook.md`, `docs/demo/gitstory-demo.gif` (and/or `.mp4`).
- **Dependencies:** All (`U1`–`U14`).
- **Definition of Done:** All CI checks pass locally, docs verified for <5 min quickstart, real self-history demo committed in `docs/demo/`, all specs audited against code, final push verified on GitHub.
