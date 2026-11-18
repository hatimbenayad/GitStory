import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import { getTopLevelDir, type RepoState } from '@gitstory/core';

export interface TreemapRect {
  id: string;
  path: string;
  name: string;
  kind: 'dir' | 'file';
  depth: number;
  ext: string;
  topDir: string;
  lines: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TmDatum {
  id: string;
  path: string;
  name: string;
  kind: 'dir' | 'file';
  ext: string;
  lines: number;
  weight?: number;
  children?: TmDatum[];
}

/**
 * Computes a deterministic squarified treemap layout from `RepoState` (`FR-17`).
 */
export function computeTreemapLayout(
  state: RepoState,
  width: number,
  height: number,
): TreemapRect[] {
  if (state.totalFiles === 0 || width <= 0 || height <= 0) return [];

  const buildNode = (dirPath: string): TmDatum => {
    const dir = state.dirs.get(dirPath);
    const children: TmDatum[] = [];
    if (dir) {
      for (const sub of dir.childrenDirs) {
        children.push(buildNode(sub));
      }
      for (const filePath of dir.childrenFiles) {
        const file = state.files.get(filePath);
        if (!file) continue;
        children.push({
          id: file.id,
          path: file.path,
          name: file.name,
          kind: 'file',
          ext: file.ext,
          lines: file.lines,
          weight: Math.max(1, file.lines),
        });
      }
    }
    return {
      id: dirPath === '' ? 'dir:__root__' : `dir:${dirPath}`,
      path: dirPath,
      name: dir?.name ?? '/',
      kind: 'dir',
      ext: '',
      lines: dir?.totalLines ?? 0,
      ...(children.length > 0 ? { children } : {}),
    };
  };

  const root = hierarchy<TmDatum>(buildNode(''))
    .sum((d) => d.weight ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.data.path.localeCompare(b.data.path));

  const laidOut = treemap<TmDatum>()
    .tile(treemapSquarify)
    .size([width, height])
    .paddingOuter(6)
    .paddingTop((node) => (node.depth === 0 ? 4 : node.depth === 1 ? 20 : 14))
    .paddingInner(2)
    .round(false)(root);

  const rects: TreemapRect[] = [];
  laidOut.each((node) => {
    if (node.depth === 0) return;
    rects.push({
      id: node.data.id,
      path: node.data.path,
      name: node.data.name,
      kind: node.data.kind,
      depth: node.depth,
      ext: node.data.ext,
      topDir: getTopLevelDir(node.data.path) || (node.data.kind === 'dir' ? node.data.name : ''),
      lines: node.data.lines,
      x0: node.x0,
      y0: node.y0,
      x1: node.x1,
      y1: node.y1,
    });
  });

  return rects;
}
