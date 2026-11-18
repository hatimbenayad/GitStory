import { getFileExtension, getParentDir } from './sanitize.js';
import type { CommitEvent, History } from './types.js';

/**
 * Snapshot representation of a file within `RepoState`.
 */
export interface FileNode {
  /** Stable visual entity ID preserved across renames (`FR-11`). */
  id: string;
  path: string;
  name: string;
  /** Parent POSIX directory path (`''` for root). */
  dir: string;
  ext: string;
  lines: number;
  createdAt: number;
  lastModifiedAt: number;
  lastAuthor: string;
  touchCount: number;
}

/**
 * Snapshot representation of a directory within `RepoState`.
 */
export interface DirNode {
  path: string;
  name: string;
  parent: string | null;
  childrenDirs: string[];
  childrenFiles: string[];
  totalLines: number;
  fileCount: number;
}

/**
 * Immutable-view repository snapshot at a given commit index (`FR-13`).
 */
export interface RepoState {
  eventIndex: number;
  t: number;
  files: ReadonlyMap<string, FileNode>;
  dirs: ReadonlyMap<string, DirNode>;
  totalFiles: number;
  totalLines: number;
  uniqueAuthors: ReadonlySet<string>;
  activeEvent: CommitEvent | null;
}

interface MutableRepoState {
  eventIndex: number;
  t: number;
  files: Map<string, FileNode>;
  dirs: Map<string, DirNode>;
  totalFiles: number;
  totalLines: number;
  uniqueAuthors: Set<string>;
  activeEvent: CommitEvent | null;
}

function getBaseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function rebuildDirs(files: ReadonlyMap<string, FileNode>): Map<string, DirNode> {
  const dirs = new Map<string, DirNode>();
  const childDirSets = new Map<string, Set<string>>();

  const ensureDir = (dirPath: string): DirNode => {
    const existing = dirs.get(dirPath);
    if (existing) return existing;

    const parent = dirPath === '' ? null : getParentDir(dirPath);
    const node: DirNode = {
      path: dirPath,
      name: dirPath === '' ? '/' : getBaseName(dirPath),
      parent,
      childrenDirs: [],
      childrenFiles: [],
      totalLines: 0,
      fileCount: 0,
    };
    dirs.set(dirPath, node);

    if (parent !== null) {
      ensureDir(parent);
      let set = childDirSets.get(parent);
      if (!set) {
        set = new Set<string>();
        childDirSets.set(parent, set);
      }
      set.add(dirPath);
    }
    return node;
  };

  ensureDir('');

  for (const file of files.values()) {
    const dirNode = ensureDir(file.dir);
    dirNode.childrenFiles.push(file.path);

    let cursor: string | null = file.dir;
    while (cursor !== null) {
      const ancestor = dirs.get(cursor);
      if (!ancestor) break;
      ancestor.fileCount += 1;
      ancestor.totalLines += file.lines;
      cursor = ancestor.parent;
    }
  }

  for (const [dirPath, set] of childDirSets.entries()) {
    const dirNode = dirs.get(dirPath);
    if (dirNode) {
      dirNode.childrenDirs = [...set].sort();
    }
  }

  for (const dirNode of dirs.values()) {
    dirNode.childrenFiles.sort();
  }

  return dirs;
}

/**
 * Creates an empty initial repository state prior to commit 0 (`eventIndex: -1`).
 */
export function createEmptyState(): RepoState {
  const files = new Map<string, FileNode>();
  return {
    eventIndex: -1,
    t: 0,
    files,
    dirs: rebuildDirs(files),
    totalFiles: 0,
    totalLines: 0,
    uniqueAuthors: new Set<string>(),
    activeEvent: null,
  };
}

/**
 * Produces a deep structural clone of `RepoState` for safe keyframe caching and mutation.
 */
export function cloneState(state: RepoState): MutableRepoState {
  const files = new Map<string, FileNode>();
  for (const [k, v] of state.files.entries()) {
    files.set(k, { ...v });
  }
  const dirs = new Map<string, DirNode>();
  for (const [k, v] of state.dirs.entries()) {
    dirs.set(k, {
      ...v,
      childrenDirs: [...v.childrenDirs],
      childrenFiles: [...v.childrenFiles],
    });
  }
  return {
    eventIndex: state.eventIndex,
    t: state.t,
    files,
    dirs,
    totalFiles: state.totalFiles,
    totalLines: state.totalLines,
    uniqueAuthors: new Set(state.uniqueAuthors),
    activeEvent: state.activeEvent,
  };
}

function mutateStateInPlace(
  state: MutableRepoState,
  event: CommitEvent,
  eventIndex: number,
  rebuildTree: boolean,
): void {
  state.eventIndex = eventIndex;
  state.t = event.t;
  state.activeEvent = event;
  state.uniqueAuthors.add(event.author);

  for (let i = 0; i < event.changes.length; i++) {
    const ch = event.changes[i]!;
    if (ch.type === 'A') {
      const lines = Math.max(0, ch.add - ch.del);
      const existing = state.files.get(ch.path);
      state.files.set(ch.path, {
        id: existing?.id ?? `f:${eventIndex}:${i}:${ch.path}`,
        path: ch.path,
        name: getBaseName(ch.path),
        dir: getParentDir(ch.path),
        ext: getFileExtension(ch.path),
        lines,
        createdAt: existing?.createdAt ?? event.t,
        lastModifiedAt: event.t,
        lastAuthor: event.author,
        touchCount: (existing?.touchCount ?? 0) + 1,
      });
    } else if (ch.type === 'M') {
      const existing = state.files.get(ch.path);
      if (existing) {
        existing.lines = Math.max(0, existing.lines + ch.add - ch.del);
        existing.lastModifiedAt = event.t;
        existing.lastAuthor = event.author;
        existing.touchCount += 1;
      } else {
        // Defensive handling for shallow clones
        state.files.set(ch.path, {
          id: `f:${eventIndex}:${i}:${ch.path}`,
          path: ch.path,
          name: getBaseName(ch.path),
          dir: getParentDir(ch.path),
          ext: getFileExtension(ch.path),
          lines: Math.max(0, ch.add - ch.del),
          createdAt: event.t,
          lastModifiedAt: event.t,
          lastAuthor: event.author,
          touchCount: 1,
        });
      }
    } else if (ch.type === 'D') {
      state.files.delete(ch.path);
    } else if (ch.type === 'R') {
      const prev = ch.from !== undefined ? state.files.get(ch.from) : undefined;
      if (ch.from !== undefined) {
        state.files.delete(ch.from);
      }
      if (prev) {
        state.files.set(ch.path, {
          ...prev,
          path: ch.path,
          name: getBaseName(ch.path),
          dir: getParentDir(ch.path),
          ext: getFileExtension(ch.path),
          lines: Math.max(0, prev.lines + ch.add - ch.del),
          lastModifiedAt: event.t,
          lastAuthor: event.author,
          touchCount: prev.touchCount + 1,
        });
      } else {
        state.files.set(ch.path, {
          id: `f:${eventIndex}:${i}:${ch.path}`,
          path: ch.path,
          name: getBaseName(ch.path),
          dir: getParentDir(ch.path),
          ext: getFileExtension(ch.path),
          lines: Math.max(0, ch.add - ch.del),
          createdAt: event.t,
          lastModifiedAt: event.t,
          lastAuthor: event.author,
          touchCount: 1,
        });
      }
    } else if (ch.type === 'C') {
      const src = ch.from !== undefined ? state.files.get(ch.from) : undefined;
      const baseLines = src?.lines ?? 0;
      state.files.set(ch.path, {
        id: `f:${eventIndex}:${i}:${ch.path}`,
        path: ch.path,
        name: getBaseName(ch.path),
        dir: getParentDir(ch.path),
        ext: getFileExtension(ch.path),
        lines: Math.max(0, baseLines + ch.add - ch.del),
        createdAt: event.t,
        lastModifiedAt: event.t,
        lastAuthor: event.author,
        touchCount: 1,
      });
    }
  }

  let totalLines = 0;
  for (const f of state.files.values()) {
    totalLines += f.lines;
  }
  state.totalFiles = state.files.size;
  state.totalLines = totalLines;

  if (rebuildTree) {
    state.dirs = rebuildDirs(state.files);
  }
}

/**
 * Purely applies a single `CommitEvent` to a `RepoState`, returning a new `RepoState`.
 */
export function applyCommitEvent(
  prevState: RepoState,
  event: CommitEvent,
  eventIndex: number,
): RepoState {
  const next = cloneState(prevState);
  mutateStateInPlace(next, event, eventIndex, true);
  return next;
}

export interface ReplayEngineOptions {
  /** Number of events between precomputed keyframes. Auto-scaled if omitted. */
  keyframeInterval?: number;
}

/**
 * Keyframe-accelerated deterministic repository state replay engine (`FR-13`).
 */
export class ReplayEngine {
  private readonly history: History;
  private readonly interval: number;
  private readonly keyframes: Map<number, MutableRepoState> = new Map();
  private cachedCursor: MutableRepoState | null = null;

  constructor(history: History, options: ReplayEngineOptions = {}) {
    this.history = history;
    const n = history.events.length;
    this.interval =
      options.keyframeInterval !== undefined && options.keyframeInterval > 0
        ? Math.floor(options.keyframeInterval)
        : Math.max(50, Math.ceil(n / 60));

    this.buildKeyframes();
  }

  private buildKeyframes(): void {
    const empty = cloneState(createEmptyState());
    this.keyframes.set(-1, empty);

    const events = this.history.events;
    if (events.length === 0) return;

    const working = cloneState(empty);
    for (let i = 0; i < events.length; i++) {
      const isKeyframe = i === 0 || i % this.interval === 0 || i === events.length - 1;
      mutateStateInPlace(working, events[i]!, i, isKeyframe);
      if (isKeyframe) {
        this.keyframes.set(i, cloneState(working));
      }
    }
  }

  /** Total number of commit events in the loaded history. */
  getEventCount(): number {
    return this.history.events.length;
  }

  /** Number of precomputed keyframes stored (excluding initial empty state). */
  getKeyframeCount(): number {
    return Math.max(0, this.keyframes.size - 1);
  }

  /**
   * Returns the exact `RepoState` at `index` (clamped to `[-1, events.length - 1]`).
   * Uses sequential fast-path when stepping forward and keyframe jump on arbitrary scrubs.
   */
  getStateAt(rawIndex: number): RepoState {
    const events = this.history.events;
    if (events.length === 0 || rawIndex < 0) {
      return this.keyframes.get(-1)!;
    }

    const target = Math.min(events.length - 1, Math.floor(rawIndex));

    // Exact hit on cached cursor
    if (this.cachedCursor && this.cachedCursor.eventIndex === target) {
      return this.cachedCursor;
    }

    // Exact hit on precomputed keyframe
    const exactKf = this.keyframes.get(target);
    if (exactKf) {
      this.cachedCursor = cloneState(exactKf);
      return this.cachedCursor;
    }

    // Fast sequential advance if cursor is slightly behind target
    if (
      this.cachedCursor &&
      this.cachedCursor.eventIndex < target &&
      target - this.cachedCursor.eventIndex <= this.interval
    ) {
      for (let i = this.cachedCursor.eventIndex + 1; i <= target; i++) {
        mutateStateInPlace(this.cachedCursor, events[i]!, i, i === target);
      }
      return this.cachedCursor;
    }

    // Find nearest preceding keyframe
    let baseIndex = -1;
    const candidate = Math.floor(target / this.interval) * this.interval;
    if (this.keyframes.has(candidate) && candidate <= target) {
      baseIndex = candidate;
    } else if (this.keyframes.has(0)) {
      baseIndex = 0;
    }

    const state = cloneState(this.keyframes.get(baseIndex)!);
    for (let i = baseIndex + 1; i <= target; i++) {
      mutateStateInPlace(state, events[i]!, i, i === target);
    }

    this.cachedCursor = state;
    return state;
  }
}
