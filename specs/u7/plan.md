# Plan: U7 — Highlight Detection, Chapters & Optional Narration

## 1. Technical Approach
- Implement `packages/core/src/highlights.ts` (`buildChapters`, `detectHighlights`) and `packages/core/src/narration.ts` (`TemplateNarrationProvider`, `createNarrationProvider`).
- Feed detected highlights and chapters directly into `TimelineEngine` (U4) for adaptive pacing slowdown and into `HudOverlay` & `TimelineBar` (U6) for documentary badges and optional captions.

## 2. Module Boundaries
- `packages/core/src/highlights.ts`
- `packages/core/src/narration.ts`
- Exported via `packages/core/src/index.ts`.
