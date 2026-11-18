# Tasks: U14 — Architecture Comparison (v2, tree-sitter)

- [x] T14.1 Write failing unit tests for TS/JS & Python import parsing, internal path resolution, and `diffArchGraphs` classification (`packages/layout/test/arch-graph.test.ts`)
- [x] T14.2 Implement `packages/layout/src/arch-graph.ts` (with pluggable `CustomImportExtractor` for `web-tree-sitter` WASM + deterministic fallback parser per ADR-005)
- [x] T14.3 Implement read-only git ref snapshot extractor in `packages/extractor` + `gitstory arch` CLI command + fixture repo integration test
- [x] T14.4 Implement `apps/web/src/components/ArchDiffView.tsx` (Diff Overlay & Side-by-Side views) and wire into view switcher
- [x] T14.5 Verify lint, typecheck, tests, build and commit Bolt U14
