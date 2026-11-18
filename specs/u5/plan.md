# Plan: U5 — Replay Renderer (PixiJS Stable File-Tree View)

## 1. Technical Approach
- Create `packages/layout` using `d3-hierarchy`, `d3-scale`, and `d3-treemap` (pure layout math — works cleanly in Node, Web Workers, and browser).
- Implement `StableTreeLayout` in `packages/layout/src/tree-layout.ts` with deterministic FNV-1a hashing for angular slots and persistent position memory per `id` so renames glide and untouched branches stay rock-steady.
- Implement `palettes.ts` in `packages/layout/src/palettes.ts` providing both the default vibrant extension/directory palette and a WCAG-accessible colorblind-safe Okabe–Ito palette.
- In `apps/web`, build `ReplayRenderer` using PixiJS v8 (`pixi.js` WebGL renderer with `preference: 'webgl'` and automatic Canvas2D fallback when WebGL context creation fails, e.g. in software headless Chromium).

## 2. Module Boundaries
- `packages/layout/src/palettes.ts`: Extension/author color palettes (default + colorblind-safe).
- `packages/layout/src/tree-layout.ts`: `StableTreeLayout` class + `computeTreeLayout()` helper.
- `apps/web/src/renderers/ReplayRenderer.ts`: PixiJS WebGL + Canvas2D fallback renderer with pan/zoom, node hover picking, and animation interpolation.

## 3. Risks & Mitigations
- **PixiJS WebGL unavailable in headless CI Chromium:** Detect WebGL support cleanly; if unavailable or if `Application.init` throws, fall back transparently to a matching high-DPI Canvas2D renderer implementing the exact same `IReplayRenderer` interface so E2E tests and export always succeed.
