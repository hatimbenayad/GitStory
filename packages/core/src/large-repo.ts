import { getFileExtension, getParentDir } from './sanitize.js';
import type { DirNode, FileNode, RepoState } from './replay.js';
import type { CommitEvent, FileChange, History } from './types.js';

export type AggregationGranularity = 'commit' | 'day' | 'week';

export interface LargeRepoOptions {
  granularity?: 'auto' | AggregationGranularity;
  maxDepth?: number;
  maxNodes?: number;
  autoThresholdEvents?: number;
}

export interface ResolvedLargeRepoPolicy {
  active: boolean;
  granularity: AggregationGranularity;
  maxDepth: number;
  maxNodes: number;
}

const DAY_SEC = 86400;
const WEEK_SEC = 7 * 86400;

/**
 * Resolves effective large-repo scaling policy for a history size (`FR-23`).
 */
export function resolveLargeRepoPolicy(
  eventCount: number,
  options: LargeRepoOptions = {},
): ResolvedLargeRepoPolicy {
  const threshold = options.autoThresholdEvents ?? 2000;
  let granularity: AggregationGranularity;

  if (!options.granularity || options.granularity === 'auto') {
    if (eventCount > 8000) granularity = 'week';
    else if (eventCount > threshold) granularity = 'day';
    else granularity = 'commit';
  } else {
    granularity = options.granularity;
  }

  const active =
    granularity !== 'commit' ||
    (options.maxDepth !== undefined && Number.isFinite(options.maxDepth)) ||
    (options.maxNodes !== undefined && options.maxNodes < 20000);

  return {
    active,
    granularity,
    maxDepth: options.maxDepth ?? (granularity === 'commit' ? Infinity : 4),
    maxNodes: options.maxNodes ?? (granularity === 'commit' ? 20000 : 1500),
  };
}

function coalesceBucketChanges(events: CommitEvent[]): FileChange[] {
  const byPath = new Map<string, FileChange>();

  for (const ev of events) {
    for (const ch of ev.changes) {
      if (ch.type === 'R' && ch.from !== undefined) {
        const prevFrom = byPath.get(ch.from);
        if (prevFrom) {
          byPath.delete(ch.from);
          if (prevFrom.type === 'A') {
            byPath.set(ch.path, {
              path: ch.path,
              type: 'A',
              add: prevFrom.add + ch.add,
              del: prevFrom.del + ch.del,
            });
          } else {
            byPath.set(ch.path, {
              path: ch.path,
              from: prevFrom.from ?? ch.from,
              type: 'R',
              add: prevFrom.add + ch.add,
              del: prevFrom.del + ch.del,
            });
          }
          continue;
        }
      }

      const prev = byPath.get(ch.path);
      if (!prev) {
        byPath.set(ch.path, { ...ch });
      } else if (prev.type === 'A' && ch.type === 'D') {
        // Added and deleted inside same bucket -> cancels out
        byPath.delete(ch.path);
      } else if (prev.type === 'A' && ch.type === 'M') {
        byPath.set(ch.path, {
          path: ch.path,
          type: 'A',
          add: Math.max(0, prev.add + ch.add - ch.del),
          del: prev.del,
        });
      } else if (prev.type === 'D' && ch.type === 'A') {
        byPath.set(ch.path, {
          path: ch.path,
          type: 'M',
          add: ch.add,
          del: prev.del,
        });
      } else if (ch.type === 'D') {
        byPath.set(ch.path, {
          path: ch.path,
          type: 'D',
          add: 0,
          del: prev.del + ch.del,
        });
      } else {
        byPath.set(ch.path, {
          ...prev,
          add: prev.add + ch.add,
          del: prev.del + ch.del,
        });
      }
    }
  }

  return [...byPath.values()];
}

/**
 * Aggregates a dense `History` into daily or weekly buckets while preserving tags
 * and net file changes (`FR-23`).
 */
export function aggregateHistory(
  history: History,
  options: { granularity: AggregationGranularity },
): History {
  if (options.granularity === 'commit' || history.events.length <= 1) {
    return history;
  }

  const bucketUnit = options.granularity === 'week' ? WEEK_SEC : DAY_SEC;
  const tagHashes = new Set(history.tags.map((t) => t.hash));
  const hashRemap = new Map<string, string>();

  const buckets: CommitEvent[][] = [];
  let currentBucket: CommitEvent[] = [];
  let currentKey = -1;

  for (const ev of history.events) {
    const key = Math.floor(ev.t / bucketUnit);
    if (currentBucket.length > 0 && key !== currentKey) {
      buckets.push(currentBucket);
      currentBucket = [];
    }
    currentKey = key;
    currentBucket.push(ev);
    // Flush immediately after a tagged release commit so chapter boundaries stay crisp
    if (tagHashes.has(ev.hash)) {
      buckets.push(currentBucket);
      currentBucket = [];
      currentKey = -1;
    }
  }
  if (currentBucket.length > 0) {
    buckets.push(currentBucket);
  }

  const aggregatedEvents: CommitEvent[] = buckets.map((group, idx) => {
    const last = group[group.length - 1]!;
    for (const ev of group) {
      hashRemap.set(ev.hash, last.hash);
    }

    // Pick dominant non-bot author in bucket
    const authorCounts = new Map<string, number>();
    let allBot = true;
    for (const ev of group) {
      if (!ev.isBot) allBot = false;
      authorCounts.set(ev.author, (authorCounts.get(ev.author) ?? 0) + 1);
    }
    let leadAuthor = last.author;
    let bestCount = -1;
    for (const [author, count] of authorCounts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        leadAuthor = author;
      }
    }

    const label = options.granularity === 'week' ? 'Week' : 'Day';
    const message =
      group.length === 1
        ? last.message
        : `${label} summary (${group.length} commits): ${last.message}`;

    return {
      hash: last.hash,
      parents: idx === 0 ? [] : [buckets[idx - 1]![buckets[idx - 1]!.length - 1]!.hash],
      t: last.t,
      author: leadAuthor,
      message,
      isBot: allBot,
      changes: coalesceBucketChanges(group),
    };
  });

  const remappedTags = history.tags.map((tag) => ({
    ...tag,
    hash: hashRemap.get(tag.hash) ?? tag.hash,
  }));

  return {
    ...history,
    tags: remappedTags,
    events: aggregatedEvents,
  };
}

function rebuildCollapsedDirs(files: ReadonlyMap<string, FileNode>): Map<string, DirNode> {
  const dirs = new Map<string, DirNode>();
  const childSets = new Map<string, Set<string>>();

  const ensureDir = (dirPath: string): DirNode => {
    const existing = dirs.get(dirPath);
    if (existing) return existing;
    const parent = dirPath === '' ? null : getParentDir(dirPath);
    const slash = dirPath.lastIndexOf('/');
    const node: DirNode = {
      path: dirPath,
      name: dirPath === '' ? '/' : slash === -1 ? dirPath : dirPath.slice(slash + 1),
      parent,
      childrenDirs: [],
      childrenFiles: [],
      totalLines: 0,
      fileCount: 0,
    };
    dirs.set(dirPath, node);
    if (parent !== null) {
      ensureDir(parent);
      let set = childSets.get(parent);
      if (!set) {
        set = new Set<string>();
        childSets.set(parent, set);
      }
      set.add(dirPath);
    }
    return node;
  };

  ensureDir('');
  for (const file of files.values()) {
    const d = ensureDir(file.dir);
    d.childrenFiles.push(file.path);
    let cursor: string | null = file.dir;
    while (cursor !== null) {
      const anc = dirs.get(cursor);
      if (!anc) break;
      anc.fileCount += 1;
      anc.totalLines += file.lines;
      cursor = anc.parent;
    }
  }

  for (const [dp, set] of childSets.entries()) {
    const dn = dirs.get(dp);
    if (dn) dn.childrenDirs = [...set].sort();
  }
  for (const dn of dirs.values()) {
    dn.childrenFiles.sort();
  }
  return dirs;
}

/**
 * Collapses files deeper than `maxDepth` into summary nodes and enforces a strict
 * upper bound `maxNodes` on `files.size + dirs.size` (`FR-23`).
 */
export function collapseRepoState(
  state: RepoState,
  options: { maxDepth?: number; maxNodes?: number },
): RepoState {
  const maxDepth = options.maxDepth ?? Infinity;
  const maxNodes = Math.max(2, options.maxNodes ?? Infinity);

  if (
    !Number.isFinite(maxDepth) &&
    state.files.size + state.dirs.size <= maxNodes
  ) {
    return state;
  }

  const collapsedFiles = new Map<string, FileNode>();

  for (const file of state.files.values()) {
    const segments = file.path.split('/');
    const depth = segments.length - 1;

    if (depth > maxDepth) {
      const bucketDir = segments.slice(0, Math.max(1, maxDepth)).join('/');
      const summaryPath = `${bucketDir}/...`;
      const existing = collapsedFiles.get(summaryPath);
      if (existing) {
        existing.lines += file.lines;
        existing.touchCount += file.touchCount;
        if (file.lastModifiedAt > existing.lastModifiedAt) {
          existing.lastModifiedAt = file.lastModifiedAt;
          existing.lastAuthor = file.lastAuthor;
        }
      } else {
        collapsedFiles.set(summaryPath, {
          id: `collapsed:${bucketDir}`,
          path: summaryPath,
          name: `${bucketDir.split('/').pop() ?? bucketDir} (…)`,
          dir: getParentDir(summaryPath),
          ext: getFileExtension(file.path),
          lines: file.lines,
          createdAt: file.createdAt,
          lastModifiedAt: file.lastModifiedAt,
          lastAuthor: file.lastAuthor,
          touchCount: file.touchCount,
        });
      }
    } else {
      collapsedFiles.set(file.path, { ...file });
    }
  }

  let dirs = rebuildCollapsedDirs(collapsedFiles);

  // Enforce strict maxNodes cap by rolling smallest tail files into root summary
  if (collapsedFiles.size + dirs.size > maxNodes) {
    const keepFilesBudget = Math.max(1, maxNodes - 2);
    const sorted = [...collapsedFiles.values()].sort(
      (a, b) => b.lines - a.lines || a.path.localeCompare(b.path),
    );

    const cappedFiles = new Map<string, FileNode>();
    let hiddenLines = 0;
    let hiddenCount = 0;

    // Iteratively fit within maxNodes accounting for ancestor directories
    let limit = Math.min(sorted.length, keepFilesBudget);
    while (limit >= 1) {
      cappedFiles.clear();
      hiddenLines = 0;
      hiddenCount = 0;

      for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i]!;
        if (i < limit) {
          cappedFiles.set(f.path, f);
        } else {
          hiddenLines += f.lines;
          hiddenCount += 1;
        }
      }

      if (hiddenCount > 0) {
        cappedFiles.set('__other_files__', {
          id: 'collapsed:__other__',
          path: '__other_files__',
          name: `+${hiddenCount} more files`,
          dir: '',
          ext: '',
          lines: hiddenLines,
          createdAt: state.t,
          lastModifiedAt: state.t,
          lastAuthor: state.activeEvent?.author ?? '',
          touchCount: hiddenCount,
        });
      }

      dirs = rebuildCollapsedDirs(cappedFiles);
      if (cappedFiles.size + dirs.size <= maxNodes) {
        break;
      }
      const excess = cappedFiles.size + dirs.size - maxNodes;
      limit = Math.max(0, limit - Math.max(1, Math.ceil(excess / 2)));
    }

    if (cappedFiles.size + dirs.size > maxNodes) {
      cappedFiles.clear();
      cappedFiles.set('__other_files__', {
        id: 'collapsed:__other__',
        path: '__other_files__',
        name: `${state.totalFiles} files`,
        dir: '',
        ext: '',
        lines: state.totalLines,
        createdAt: state.t,
        lastModifiedAt: state.t,
        lastAuthor: state.activeEvent?.author ?? '',
        touchCount: state.totalFiles,
      });
      dirs = rebuildCollapsedDirs(cappedFiles);
    }

    return {
      ...state,
      files: cappedFiles,
      dirs,
      totalFiles: cappedFiles.size,
      totalLines: state.totalLines,
    };
  }

  return {
    ...state,
    files: collapsedFiles,
    dirs,
    totalFiles: collapsedFiles.size,
    totalLines: state.totalLines,
  };
}
