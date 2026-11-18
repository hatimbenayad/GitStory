import { getFileExtension, getParentDir, getTopLevelDir, normalizeRepoPath } from '@gitstory/core';

export type ArchLanguage = 'ts' | 'js' | 'py';
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface ArchNode {
  id: string;
  label: string;
  group: string;
  language: ArchLanguage;
  imports: string[];
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

export interface ArchDiffNode extends ArchNode {
  status: DiffStatus;
  prevImports?: string[];
}

export interface ArchDiffEdge extends ArchEdge {
  status: DiffStatus;
}

export interface ArchDiff {
  refA: string;
  refB: string;
  nodes: ArchDiffNode[];
  edges: ArchDiffEdge[];
  summary: {
    addedNodes: number;
    removedNodes: number;
    changedNodes: number;
    addedEdges: number;
    removedEdges: number;
  };
}

/**
 * Pluggable AST parser hook allowing `web-tree-sitter` WASM grammars to override the built-in
 * lexical extractor (`ADR-005`).
 */
export type CustomImportExtractor = (code: string, language: ArchLanguage) => string[];

const EXT_TO_LANG: Record<string, ArchLanguage> = {
  ts: 'ts',
  tsx: 'ts',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  py: 'py',
};

export function detectArchLanguage(filePath: string): ArchLanguage | null {
  const ext = getFileExtension(filePath);
  return EXT_TO_LANG[ext] ?? null;
}

function stripJsComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function stripPyComments(code: string): string {
  return code.replace(/#.*$/gm, '');
}

/**
 * Extracts raw module specifiers from TypeScript, JavaScript, or Python source code (`FR-24`, `ADR-005`).
 */
export function extractModuleImports(
  code: string,
  language: ArchLanguage,
  customExtractor?: CustomImportExtractor,
): string[] {
  if (customExtractor) {
    return customExtractor(code, language);
  }

  const results: string[] = [];
  const seen = new Set<string>();
  const add = (spec: string) => {
    const trimmed = spec.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      results.push(trimmed);
    }
  };

  if (language === 'ts' || language === 'js') {
    const cleaned = stripJsComments(code);
    const matches: Array<{ index: number; spec: string }> = [];
    const patterns = [
      /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(cleaned)) !== null) {
        if (m[1]) matches.push({ index: m.index, spec: m[1] });
      }
    }
    matches.sort((a, b) => a.index - b.index);
    for (const m of matches) add(m.spec);
  } else if (language === 'py') {
    const cleaned = stripPyComments(code);
    for (const line of cleaned.split(/\r?\n/)) {
      const trimmed = line.trim();
      const fromMatch = /^from\s+(\.+[A-Za-z0-9_.]*|[A-Za-z0-9_.]+)\s+import\b/.exec(trimmed);
      if (fromMatch?.[1]) {
        add(fromMatch[1]);
        continue;
      }
      const importMatch = /^import\s+(.+)$/.exec(trimmed);
      if (importMatch?.[1]) {
        for (const part of importMatch[1].split(',')) {
          const mod = part.trim().split(/\s+as\s+/)[0]?.trim();
          if (mod) add(mod);
        }
      }
    }
  }

  return results;
}

function resolvePosixPath(baseDir: string, rel: string): string | null {
  const parts = (baseDir ? `${baseDir}/${rel}` : rel).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

function resolveInternalModule(
  fromPath: string,
  spec: string,
  language: ArchLanguage,
  allFiles: ReadonlySet<string>,
): string | null {
  const fromDir = getParentDir(fromPath);

  if (language === 'ts' || language === 'js') {
    if (!spec.startsWith('.')) return null;
    const rawTarget = resolvePosixPath(fromDir, spec);
    if (!rawTarget) return null;

    const stripped = rawTarget.replace(/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/, '');
    const candidates = [
      rawTarget,
      `${stripped}.ts`,
      `${stripped}.tsx`,
      `${stripped}.js`,
      `${stripped}.jsx`,
      `${stripped}/index.ts`,
      `${stripped}/index.tsx`,
      `${stripped}/index.js`,
    ];
    for (const c of candidates) {
      if (allFiles.has(c)) return c;
    }
    return null;
  }

  // Python resolution (relative `.foo` / `..bar` or absolute dotted path)
  if (spec.startsWith('.')) {
    let dots = 0;
    while (dots < spec.length && spec[dots] === '.') dots++;
    const rest = spec.slice(dots).replace(/\./g, '/');
    let dirParts = fromDir ? fromDir.split('/') : [];
    for (let i = 1; i < dots; i++) {
      dirParts = dirParts.slice(0, -1);
    }
    const base = [...dirParts, ...(rest ? [rest] : [])].join('/');
    const candidates = [`${base}.py`, `${base}/__init__.py`];
    for (const c of candidates) {
      if (allFiles.has(c)) return c;
    }
    return null;
  }

  const asPath = spec.replace(/\./g, '/');
  if (allFiles.has(`${asPath}.py`)) return `${asPath}.py`;
  if (allFiles.has(`${asPath}/__init__.py`)) return `${asPath}/__init__.py`;
  return null;
}

/**
 * Builds a directed module dependency graph from a snapshot of source files at `ref` (`FR-24`).
 */
export function buildArchGraph(
  ref: string,
  files: ReadonlyMap<string, string>,
  customExtractor?: CustomImportExtractor,
): ArchGraph {
  const normalizedFiles = new Map<string, string>();
  for (const [rawPath, content] of files.entries()) {
    try {
      const p = normalizeRepoPath(rawPath);
      if (detectArchLanguage(p)) {
        normalizedFiles.set(p, content);
      }
    } catch {
      // skip invalid paths
    }
  }

  const allPaths = new Set(normalizedFiles.keys());
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];

  for (const [path, content] of [...normalizedFiles.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const language = detectArchLanguage(path)!;
    const rawSpecs = extractModuleImports(content, language, customExtractor);
    const internal: string[] = [];
    const external: string[] = [];

    for (const spec of rawSpecs) {
      const resolved = resolveInternalModule(path, spec, language, allPaths);
      if (resolved && resolved !== path) {
        if (!internal.includes(resolved)) {
          internal.push(resolved);
          edges.push({ from: path, to: resolved });
        }
      } else {
        external.push(spec);
      }
    }

    internal.sort();
    external.sort();

    const slash = path.lastIndexOf('/');
    nodes.push({
      id: path,
      label: slash === -1 ? path : path.slice(slash + 1),
      group: getTopLevelDir(path) || 'root',
      language,
      imports: internal,
      externalImports: external,
      lines: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    });
  }

  return { ref, nodes, edges };
}

/**
 * Diffs two architecture graphs (`refA` vs `refB`) classifying nodes and edges as
 * `added` (green), `removed` (red), `changed` (amber), or `unchanged` (`FR-25`).
 */
export function diffArchGraphs(graphA: ArchGraph, graphB: ArchGraph): ArchDiff {
  const mapA = new Map(graphA.nodes.map((n) => [n.id, n]));
  const mapB = new Map(graphB.nodes.map((n) => [n.id, n]));

  const nodes: ArchDiffNode[] = [];
  let addedNodes = 0;
  let removedNodes = 0;
  let changedNodes = 0;

  const allNodeIds = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const id of [...allNodeIds].sort()) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    if (!a && b) {
      addedNodes++;
      nodes.push({ ...b, status: 'added' });
    } else if (a && !b) {
      removedNodes++;
      nodes.push({ ...a, status: 'removed' });
    } else if (a && b) {
      const importsChanged =
        a.imports.join('|') !== b.imports.join('|') ||
        a.externalImports.join('|') !== b.externalImports.join('|');
      const status: DiffStatus = importsChanged ? 'changed' : 'unchanged';
      if (status === 'changed') changedNodes++;
      nodes.push({
        ...b,
        status,
        ...(importsChanged ? { prevImports: a.imports } : {}),
      });
    }
  }

  const edgeKey = (e: ArchEdge) => `${e.from}=>${e.to}`;
  const edgesA = new Map(graphA.edges.map((e) => [edgeKey(e), e]));
  const edgesB = new Map(graphB.edges.map((e) => [edgeKey(e), e]));

  const edges: ArchDiffEdge[] = [];
  let addedEdges = 0;
  let removedEdges = 0;

  const allEdgeKeys = new Set([...edgesA.keys(), ...edgesB.keys()]);
  for (const key of [...allEdgeKeys].sort()) {
    const ea = edgesA.get(key);
    const eb = edgesB.get(key);
    if (!ea && eb) {
      addedEdges++;
      edges.push({ ...eb, status: 'added' });
    } else if (ea && !eb) {
      removedEdges++;
      edges.push({ ...ea, status: 'removed' });
    } else if (eb) {
      edges.push({ ...eb, status: 'unchanged' });
    }
  }

  return {
    refA: graphA.ref,
    refB: graphB.ref,
    nodes,
    edges,
    summary: {
      addedNodes,
      removedNodes,
      changedNodes,
      addedEdges,
      removedEdges,
    },
  };
}

export interface PositionedArchNode extends ArchDiffNode {
  x: number;
  y: number;
}

export interface PositionedArchEdge extends ArchDiffEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Computes deterministic grouped circular coordinates for visualizing an `ArchDiff` (`FR-25`).
 */
export function layoutArchDiff(
  diff: ArchDiff,
  width: number,
  height: number,
): { nodes: PositionedArchNode[]; edges: PositionedArchEdge[] } {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(80, width * 0.36);
  const ry = Math.max(70, height * 0.36);

  const sorted = [...diff.nodes].sort(
    (a, b) => a.group.localeCompare(b.group) || a.id.localeCompare(b.id),
  );
  const n = Math.max(1, sorted.length);

  const positionedNodes: PositionedArchNode[] = sorted.map((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    };
  });

  const posById = new Map(positionedNodes.map((p) => [p.id, p]));
  const positionedEdges: PositionedArchEdge[] = [];
  for (const e of diff.edges) {
    const from = posById.get(e.from);
    const to = posById.get(e.to);
    if (from && to) {
      positionedEdges.push({
        ...e,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      });
    }
  }

  return { nodes: positionedNodes, edges: positionedEdges };
}
