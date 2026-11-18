# Plan: U9 — Contributor View & Streamgraph

## 1. Technical Approach
- Implement pure math in `packages/layout/src/contributor-layout.ts` (`computeContributorStream`, `computeActiveContributors`) using deterministic initials, color palette mapping, and centered streamgraph stacking.
- Implement `apps/web/src/components/ContributorView.tsx` combining a Canvas2D contributor-to-file activity map (reusing `StableTreeLayout` coordinates for touched files) and an interactive SVG/Canvas streamgraph synchronized to `TimelineEngine`.
