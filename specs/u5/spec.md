# Spec: U5 — Replay Renderer (PixiJS Stable File-Tree View)

## 1. Purpose & Why
The centerpiece of GitStory is the animated file-tree documentary (`FR-16`). U5 delivers:
1. A deterministic, layout-stable hierarchical radial tree layout engine (`@gitstory/layout`) backed by `d3-hierarchy` + hash-seeded angular anchors (`ADR-002`) so existing files never jump wildly between commits (`FR-22`).
2. A PixiJS WebGL renderer (`apps/web/src/renderers/ReplayRenderer.ts`, with Canvas2D fallback when WebGL is unavailable in headless environments) animating file additions (bloom), modifications (flash pulse), renames (smooth glide preserving visual identity), and deletions (fade out).

## 2. Functional Requirements Covered
- `FR-16`: Animated radial/force tree with files appearing, flashing on modify, fading on delete, moving on rename.
- `FR-22`: Layout stability — unchanged nodes stay spatially stable across frames.
- Accessibility: Reduced-motion mode (`reducedMotion: true` disables flash/bloom bursts and snaps cleanly), colorblind-safe Okabe–Ito palette option (`colorblindSafe: true`), bot dimming/hiding.

## 3. Data Contracts (`@gitstory/layout`)
```ts
export interface LayoutNode {
  id: string;
  path: string;
  name: string;
  kind: 'dir' | 'file';
  parentId: string | null;
  x: number;
  y: number;
  radius: number;
  depth: number;
  ext: string;
  topDir: string;
  lines: number;
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}
```

## 4. Behavior & Stability Invariant
- `StableTreeLayout` assigns every directory and file a deterministic angle derived from `d3-hierarchy` order + persistent hash anchor map.
- **Stability Test Invariant (`FR-22`):** When a single file is added to directory `B`, nodes in unrelated directory `A` move by `< 1e-6` (exact zero displacement), and sibling nodes in `B` stay within a tightly bounded tolerance.
- **Visual Animations:**
  - `A` (Added): node scales from `0 -> 1` with bright accent halo.
  - `M` (Modified): ripple/flash pulse on node + directory edge highlight.
  - `R` (Renamed): interpolates `(prevX, prevY) -> (nextX, nextY)` using the preserved `FileNode.id`.
  - `D` (Deleted): retains ghost node briefly while alpha fades `1 -> 0`.
- **Renderer API:** Supports interactive pan/zoom, hit-test hover tooltip (showing escaped path, lines, last author), and `renderDeterministicFrame(state, eventProgress)` returning the underlying canvas for U12 export.
