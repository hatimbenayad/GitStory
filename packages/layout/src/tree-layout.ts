import { hierarchy } from 'd3-hierarchy';
import { getTopLevelDir, type RepoState } from '@gitstory/core';
import { hashString } from './palettes.js';

export interface LayoutNode {
  id: string;
  path: string;
  name: string;
  kind: 'dir' | 'file';
  parentId: string | null;
  x: number;
  y: number;
  prevX?: number;
  prevY?: number;
  radius: number;
  depth: number;
  ext: string;
  topDir: string;
  lines: number;
  changeType?: 'A' | 'M' | 'R' | 'C';
}

export interface DeletedGhostNode {
  id: string;
  path: string;
  x: number;
  y: number;
  radius: number;
  ext: string;
}

export interface LayoutEdge {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayoutFrame {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  deletedGhosts: DeletedGhostNode[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

interface HierarchyDatum {
  id: string;
  path: string;
  name: string;
  kind: 'dir' | 'file';
  ext: string;
  lines: number;
  children?: HierarchyDatum[];
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;

/**
 * Deterministic, layout-stable radial file-tree engine (`ADR-002`, `FR-16`, `FR-22`).
 *
 * Uses `d3-hierarchy` for tree topology combined with hash-anchored angular sectors so
 * adding or deleting files in one branch never displaces nodes in unrelated branches,
 * while renamed files preserve their entity ID and expose `(prevX, prevY)` for smooth gliding.
 */
export class StableTreeLayout {
  private readonly lastPositions = new Map<string, { x: number; y: number; path: string; radius: number; ext: string }>();
  private readonly dirAngles = new Map<string, number>();

  /** Resets remembered positions (call when loading a new repository). */
  reset(): void {
    this.lastPositions.clear();
    this.dirAngles.clear();
  }

  private getOrAssignAngle(key: string, parentAngle: number, depth: number, spread: number): number {
    const existing = this.dirAngles.get(key);
    if (existing !== undefined) return existing;

    const h = hashString(key);
    const unit = (h % 10000) / 10000; // [0, 1)
    let angle: number;
    if (depth === 1) {
      // Spread top-level branches evenly around full circle using deterministic hash
      angle = unit * TAU;
    } else {
      // Fan children deterministically inside parent's angular sector
      angle = parentAngle + (unit - 0.5) * spread;
    }
    this.dirAngles.set(key, angle);
    return angle;
  }

  /**
   * Computes a spatially stable radial tree frame for `state`.
   */
  compute(state: RepoState): TreeLayoutFrame {
    const activeChangeMap = new Map<string, 'A' | 'M' | 'R' | 'C'>();
    const deletedPaths = new Set<string>();
    if (state.activeEvent) {
      for (const ch of state.activeEvent.changes) {
        if (ch.type === 'D') {
          deletedPaths.add(ch.path);
        } else {
          activeChangeMap.set(ch.path, ch.type);
        }
      }
    }

    // Build d3-hierarchy tree from RepoState
    const buildNode = (dirPath: string): HierarchyDatum => {
      const dir = state.dirs.get(dirPath);
      const children: HierarchyDatum[] = [];
      if (dir) {
        for (const subPath of dir.childrenDirs) {
          children.push(buildNode(subPath));
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

    const root = hierarchy<HierarchyDatum>(buildNode(''));
    const nodes: LayoutNode[] = [];
    const nodeById = new Map<string, LayoutNode>();
    const nodeAngles = new Map<string, number>();

    root.each((hNode) => {
      const d = hNode.data;
      const depth = hNode.depth;
      const parentId = hNode.parent ? hNode.parent.data.id : null;

      let x = 0;
      let y = 0;
      let angle = 0;

      if (depth === 0) {
        x = 0;
        y = 0;
        angle = 0;
      } else {
        const parentNode = parentId ? nodeById.get(parentId) : undefined;
        const parentX = parentNode?.x ?? 0;
        const parentY = parentNode?.y ?? 0;
        const parentAngle = parentId ? (nodeAngles.get(parentId) ?? 0) : 0;

        if (d.kind === 'dir') {
          const spread = depth === 1 ? TAU : Math.max(0.55, 1.8 / depth);
          angle = this.getOrAssignAngle(`dir:${d.path}`, parentAngle, depth, spread);
          const branchLen = depth === 1 ? 155 : Math.max(68, 125 - depth * 14);
          x = parentX + Math.cos(angle) * branchLen;
          y = parentY + Math.sin(angle) * branchLen;
        } else {
          // Leaf files orbit their parent directory in deterministic Phyllotaxis / hash-anchored slots
          const h = hashString(d.path);
          const slot = h % 64;
          const fileAngle = parentAngle + (slot * GOLDEN_ANGLE) % TAU;
          const dist = 24 + Math.sqrt(slot + 1) * 9.5;
          angle = fileAngle;
          x = parentX + Math.cos(fileAngle) * dist;
          y = parentY + Math.sin(fileAngle) * dist;
        }
      }

      nodeAngles.set(d.id, angle);

      const radius =
        d.kind === 'dir'
          ? depth === 0
            ? 10
            : Math.max(5, 8 - depth)
          : Math.max(3.2, Math.min(11, 3 + Math.log2(1 + d.lines) * 0.9));

      const prev = this.lastPositions.get(d.id);
      const changeType = d.kind === 'file' ? activeChangeMap.get(d.path) : undefined;

      const layoutNode: LayoutNode = {
        id: d.id,
        path: d.path,
        name: d.name,
        kind: d.kind,
        parentId,
        x,
        y,
        ...(prev ? { prevX: prev.x, prevY: prev.y } : {}),
        radius,
        depth,
        ext: d.ext,
        topDir: getTopLevelDir(d.path),
        lines: d.lines,
        ...(changeType ? { changeType } : {}),
      };

      nodes.push(layoutNode);
      nodeById.set(d.id, layoutNode);
    });

    const edges: LayoutEdge[] = [];
    for (const n of nodes) {
      if (n.parentId) {
        const parent = nodeById.get(n.parentId);
        if (parent) {
          edges.push({
            fromId: parent.id,
            toId: n.id,
            x1: parent.x,
            y1: parent.y,
            x2: n.x,
            y2: n.y,
          });
        }
      }
    }

    // Collect deleted ghost nodes for fade-out animation
    const deletedGhosts: DeletedGhostNode[] = [];
    if (deletedPaths.size > 0) {
      for (const [id, prev] of this.lastPositions.entries()) {
        if (deletedPaths.has(prev.path) && !nodeById.has(id)) {
          deletedGhosts.push({
            id,
            path: prev.path,
            x: prev.x,
            y: prev.y,
            radius: prev.radius,
            ext: prev.ext,
          });
        }
      }
    }

    // Update position memory & compute bounds
    let minX = -120;
    let maxX = 120;
    let minY = -120;
    let maxY = 120;

    this.lastPositions.clear();
    for (const n of nodes) {
      this.lastPositions.set(n.id, {
        x: n.x,
        y: n.y,
        path: n.path,
        radius: n.radius,
        ext: n.ext,
      });
      if (n.x - n.radius < minX) minX = n.x - n.radius;
      if (n.x + n.radius > maxX) maxX = n.x + n.radius;
      if (n.y - n.radius < minY) minY = n.y - n.radius;
      if (n.y + n.radius > maxY) maxY = n.y + n.radius;
    }

    return {
      nodes,
      edges,
      deletedGhosts,
      bounds: { minX, maxX, minY, maxY },
    };
  }
}
