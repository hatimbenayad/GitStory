# ADR-005: Architecture Comparison Parsing Strategy (v2)

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** `FR-24`, `FR-25`, Unit `U14`

## Context
`FR-24` specifies using `tree-sitter` compiled to WASM (`web-tree-sitter`) to extract module/dependency graphs for TypeScript/JavaScript and Python between two Git refs. Loading external `.wasm` grammar binaries can fail in air-gapped or Node unit test environments if grammar binaries aren't bundled.

## Decision
Implement a pluggable `ModuleImportParser` in `packages/layout` (and `apps/cli`) that:
1. Uses `web-tree-sitter` WASM AST parsing when the `.wasm` language grammars (`tree-sitter-typescript.wasm`, `tree-sitter-javascript.wasm`, `tree-sitter-python.wasm`) are available.
2. Automatically falls back to a deterministic, spec-tested TypeScript/JS/Python lexical import extractor (handling ES `import`/`export ... from`, dynamic `import()`, CommonJS `require()`, and Python `import`/`from ... import` while ignoring comments and strings) whenever WASM grammars are absent.
3. Resolves relative module paths against the snapshot file list at each ref (`refA`, `refB`) and computes a structured `ArchDiff` (`added`, `removed`, `changed`, `unchanged` modules and edges).

## Consequences
- True `web-tree-sitter` integration is supported out of the box when WASM grammars are provided, while tests, CLI offline runs, and browser previews always succeed reliably without broken WASM fetches.
