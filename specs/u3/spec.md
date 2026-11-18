# Spec: U3 — State Replay Engine & Keyframes

## 1. Purpose & Why
To enable instant timeline scrubbing across thousands of commits without re-running the entire history on every seek, GitStory needs a deterministic state replay engine that transforms `CommitEvent[]` into an evolving file-tree snapshot (`RepoState`) backed by periodic immutable keyframes.

## 2. Functional Requirements Covered
- `FR-13`: Build an evolving file-tree state by replaying events; precompute keyframes every `N` events for instant scrubbing.

## 3. Data Contracts (`@gitstory/core`)
```ts
export interface FileNode {
  id: string;              // Stable visual entity ID (preserved across renames!)
  path: string;
  name: string;
  dir: string;             // Parent directory path ('' for root)
  ext: string;             // Lowercase extension without dot (or '')
  lines: number;           // Estimated line count (>= 0)
  createdAt: number;
  lastModifiedAt: number;
  lastAuthor: string;
  touchCount: number;
}

export interface DirNode {
  path: string;            // '' for root
  name: string;
  parent: string | null;
  childrenDirs: string[];
  childrenFiles: string[];
  totalLines: number;
  fileCount: number;
}

export interface RepoState {
  eventIndex: number;      // -1 before first commit, 0..N-1 after event i
  t: number;
  files: ReadonlyMap<string, FileNode>;
  dirs: ReadonlyMap<string, DirNode>;
  totalFiles: number;
  totalLines: number;
  uniqueAuthors: ReadonlySet<string>;
  activeEvent: CommitEvent | null;
}
```

## 4. Behavior & Invariants
- **Add (`A`):** Creates a new `FileNode` with a deterministic unique `id`, `lines = Math.max(0, change.add - change.del)`.
- **Modify (`M`):** Updates existing `FileNode` (or creates it defensively if absent in shallow clones): `lines = Math.max(0, node.lines + change.add - change.del)`, increments `touchCount`, updates `lastModifiedAt` and `lastAuthor`.
- **Delete (`D`):** Removes the file from `files` and prunes any ancestor directories that become completely empty (keeping root `''`).
- **Rename (`R`):** Moves `FileNode` from `change.from` to `change.path` **preserving `node.id` and `createdAt`**, updates `lines`, prunes old empty parent directories, and ensures new parent directories exist. If `change.from` was absent (e.g. shallow clone), creates a new node at `change.path`.
- **Copy (`C`):** Clones base lines from `change.from` (if present) into a new `FileNode` with a fresh `id` at `change.path`, applying `+ add - del`.
- **Keyframes:** Precomputes snapshots every `keyframeInterval` events (default `100`). `getStateAt(index)` clones the nearest preceding keyframe and replays at most `keyframeInterval - 1` events.
- **Core Correctness Property:** For any history and any arbitrary sequence of scrubs `i1, i2, ..., ik`, `engine.getStateAt(i)` MUST equal a fresh replay from `0..i` in all fields (`files`, `dirs`, `totalFiles`, `totalLines`, `uniqueAuthors`).

## 5. Edge Cases
- Empty history (`events.length === 0`): `getStateAt(-1)` and `getStateAt(0)` return empty root state safely without throwing.
- Out-of-bounds index: clamped to `[-1, events.length - 1]`.
- Shallow clone modifying or deleting a file that was never previously added: handled defensively without negative counts or crashes.
- Case-sensitive paths on Linux/macOS preserved; duplicate renames within a single commit handled cleanly.
