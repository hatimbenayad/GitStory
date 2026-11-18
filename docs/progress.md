# GitStory Progress Log

One line per completed Bolt (plus Inception milestones and performance benchmarks).

| Bolt / Milestone | Unit | Status | Date | Notes |
|---|---|---|---|---|
| Inception-0 | Setup | Done | 2026-11-18 | Initialized git repo, `.gitignore`, `PRD.md`, pushed `main` to GitHub |
| Inception-1 | Docs | Done | 2026-11-18 | Created `constitution.md`, `intent.md`, `user-stories.md`, `units.md`, and ADRs 001–005 |
| Inception-2 | Specs | Done | 2026-11-18 | Created `spec.md`, `plan.md`, and `tasks.md` for all 15 units (`specs/u1`–`specs/u15`) |
| Bolt-U1 | U1 | Done | 2026-11-18 | Monorepo scaffold + `@gitstory/core` types, JSON Schema v1, runtime validator, sanitize utils (13 tests passing) |
| Bolt-U2 | U2 | Done | 2026-11-18 | `@gitstory/extractor` streaming git log parser (`--raw --numstat -z`), `.mailmap`, bot detection, tags + `gitstory` CLI (`extract`/`serve`) (23 tests passing) |
| Bolt-U3 | U3 | Done | 2026-11-18 | `@gitstory/core` `ReplayEngine` with keyframe acceleration, rename ID preservation, empty-dir pruning & property-style scrub equivalence test (26 tests passing) |
| Bolt-U4 | U4 | Done | 2026-11-18 | `@gitstory/timeline` virtual clock, adaptive pacing (gap compression + highlight linger), constant mode, chapter jumps & deterministic export sampling (29 tests passing) |
| Bolt-U5 | U5 | Done | 2026-11-18 | `@gitstory/layout` `StableTreeLayout` (zero unrelated-branch drift, rename glide tracking, Okabe-Ito palette) + PixiJS v8 WebGL `ReplayRenderer` with Canvas2D fallback (32 tests passing) |
| Bolt-U6 | U6 | Done | 2026-11-18 | MVP complete! React+Vite+Zustand web shell, drag-drop `history.json`, File System Access API local folder loader, HUD, timeline controls, keyboard shortcuts, shareable URLs (34 tests passing) |
| Bolt-U7 | U7 | Done | 2026-11-18 | Documentary highlight detection (all 5 categories), tag chapters, opt-in zero-key `TemplateNarrationProvider` wired into timeline pacing & HUD (37 tests passing) |
| Bolt-U10 | U10 | Done | 2026-11-18 | IndexedDB LRU cache (`idb`) keyed by repo+HEAD+options + dedicated Vite Web Worker offloading (`history.worker.ts`) (40 tests passing) |
| Bolt-U8 | U8 | Done | 2026-11-18 | Animated squarified Treemap layout (`d3-hierarchy`) + `TreemapView` synchronized with timeline & palette (42 tests passing) |
| Bolt-U9 | U9 | Done | 2026-11-18 | Contributor activity canvas (avatars gravitating toward touched files) + interactive centered streamgraph with bot filtering (45 tests passing) |
| Bolt-U11 | U11 | Done | 2026-11-18 | Large-repo scaling (day/week aggregation, depth collapse, node cap) + UI controls; **Bench:** 5k commits: agg 5.0ms, index 23.6ms, avg frame 3.76ms; 10k commits: agg 7.8ms, index 3.2ms, avg frame 4.45ms (48 tests passing) |
| Bolt-U12 | U12 | Done | 2026-11-18 | `@gitstory/exporter` (WebCodecs H.264 + `mp4-muxer` MP4, pure-TS `gifenc` GIF89a, `AbortSignal` cancellation) + `ExportModal` with HUD burn-in (51 tests passing) |
