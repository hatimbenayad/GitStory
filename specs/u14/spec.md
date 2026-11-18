# Spec: U14 — Architecture Comparison (v2, tree-sitter)

## 1. Purpose & Why
Beyond file counts, teams want to understand how module boundaries and dependencies evolved between two releases or commits (`FR-24`, `FR-25`). U14 builds module dependency graphs for TypeScript/JavaScript and Python at two refs (`refA`, `refB`) and visualizes their diff.

## 2. Functional Requirements Covered
- `FR-24`: Choose two refs (tags/commits); compute module/dependency graphs via tree-sitter (WASM, with ADR-005 fallback) for TypeScript/JavaScript and Python.
- `FR-25`: Side-by-side and diff overlay views highlighting added (green), removed (red), and changed (amber) modules and edges.

## 3. Data Contracts (`@gitstory/layout`)
```ts
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ArchNode {
  id: string;              // normalized module path
  label: string;
  group: string;           // top-level directory / package
  language: 'ts' | 'js' | 'py';
  imports: string[];       // resolved internal module paths
  externalImports: string[];
  lines: number;
}

export interface ArchEdge {
  from: string;
  to: string;
}

export interface ArchGraph {
  ref: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface ArchDiff {
  refA: string;
  refB: string;
  nodes: Array<ArchNode & { status: DiffStatus; prevImports?: string[] }>;
  edges: Array<ArchEdge & { status: DiffStatus }>;
  summary: { addedNodes: number; removedNodes: number; changedNodes: number; addedEdges: number; removedEdges: number };
}
```

## 4. Behavior
- Supports `web-tree-sitter` WASM AST extraction when grammars are configured, falling back seamlessly to the spec-tested lexical parser (`ADR-005`) for TS/JS (`import ... from`, `export ... from`, `import()`, `require()`) and Python (`import x`, `from x.y import z`).
- CLI adds `gitstory arch <path> <refA> <refB> [-o arch-diff.json]` reading file contents at `<refA>` and `<refB>` via `git ls-tree` + `git show` (zero checkout / zero mutation of working tree!).
- Web app adds the `Architecture` tab supporting:
  - Loading an `arch-diff.json` file or exploring an auto-derived dependency diff from any loaded history's refs/chapters.
  - Toggle between **Diff Overlay** and **Side-by-Side** (`refA` vs `refB`) with green (added), red (removed), amber (changed), and muted slate (unchanged) styling + colorblind-safe icons/patterns.
