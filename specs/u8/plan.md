# Plan: U8 — Treemap View

## 1. Technical Approach
- Add `packages/layout/src/treemap-layout.ts` building a `d3.hierarchy` from `RepoState.dirs` and `RepoState.files`, applying `d3.treemap().tile(d3.treemapSquarify).paddingOuter(6).paddingTop(20).paddingInner(2)`.
- Render in `apps/web/src/components/TreemapView.tsx` on a responsive Canvas2D with smooth linear interpolation (`lerp`) keyed by `FileNode.id` and hit-test tooltips.

## 2. Risks & Mitigations
- **Huge file counts creating sub-pixel rects:** Skip drawing individual labels below minimum pixel dimensions (`w < 44 || h < 18`) and respect `maxNodes` / directory collapse from U11.
