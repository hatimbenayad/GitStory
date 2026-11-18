# Plan: U14 — Architecture Comparison (v2, tree-sitter)

## 1. Technical Approach
- Add `packages/layout/src/arch-graph.ts` implementing:
  - Optional `web-tree-sitter` parser adapter + deterministic TS/JS/Python import extractor (`extractModuleImports`).
  - Relative path resolver (`buildArchGraph`) matching internal repo files.
  - Graph differ (`diffArchGraphs(graphA, graphB)`) classifying nodes & edges as `added | removed | changed | unchanged`.
  - Deterministic grouped circle/layered layout (`layoutArchDiff`) for clean side-by-side and overlay rendering.
- Add `packages/extractor/src/arch-extractor.ts` using `git ls-tree -r --name-only <ref>` and `git show <ref>:<path>` (read-only, no checkout) + CLI subcommand `gitstory arch <path> <refA> <refB>`.
- Add `apps/web/src/components/ArchDiffView.tsx` with Diff Overlay & Side-by-Side modes, ref selectors, and JSON upload.
