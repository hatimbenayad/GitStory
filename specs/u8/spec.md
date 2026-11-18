# Spec: U8 — Treemap View

## 1. Purpose & Why
While the radial tree shows topology, a squarified treemap reveals codebase weight and architectural balance—showing which subsystems dominate lines of code over time (`FR-17`).

## 2. Functional Requirements Covered
- `FR-17`: Treemap view with animated transitions showing file/directory size over time.

## 3. Data Contracts & Behavior
- `computeTreemapLayout(state: RepoState, width: number, height: number, options?: TreemapOptions): TreemapRect[]` in `@gitstory/layout` using `d3-hierarchy` + `d3-treemap` (`treemapSquarify`).
- Every file gets weight `Math.max(1, file.lines)` so 0-line/binary files remain visible without breaking `d3-treemap`.
- Deterministic child ordering (by top-level directory and path) minimizes rectangle flipping between frames.
- `TreemapView` in `apps/web` interpolates rectangle bounds smoothly across commits (disabled when `reducedMotion` is enabled), shows directory headers, file labels where rectangles fit, hover tooltips, and shares the same `TimelineEngine` and palette settings.
