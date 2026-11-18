import type { History } from '@gitstory/core';
import { getPaletteColor } from './palettes.js';

export interface StreamPoint {
  bucketIndex: number;
  eventIndex: number;
  value: number;
  y0: number;
  y1: number;
}

export interface ContributorSeries {
  authorId: string;
  name: string;
  initials: string;
  color: string;
  isBot: boolean;
  totalCommits: number;
  points: StreamPoint[];
}

export interface ContributorStreamData {
  bucketCount: number;
  bucketEventIndices: number[];
  series: ContributorSeries[];
  minY: number;
  maxY: number;
  maxStackHeight: number;
}

export interface ActiveContributor {
  authorId: string;
  name: string;
  initials: string;
  color: string;
  isBot: boolean;
  recency: number; // 1 = current commit, fading toward 0
  touchedPaths: string[];
}

/**
 * Generates clean 1–2 character initials for a contributor name.
 */
export function getAuthorInitials(name: string): string {
  const cleaned = name.replace(/\[bot\]/gi, '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Computes silhouette-centered streamgraph bands of contributor activity over time (`FR-18`).
 */
export function computeContributorStream(
  history: History,
  options: {
    bucketCount?: number;
    topN?: number;
    hideBots?: boolean;
    colorblindSafe?: boolean;
  } = {},
): ContributorStreamData {
  const events = history.events;
  if (events.length === 0) {
    return {
      bucketCount: 0,
      bucketEventIndices: [],
      series: [],
      minY: 0,
      maxY: 0,
      maxStackHeight: 0,
    };
  }

  const hideBots = options.hideBots ?? false;
  const colorblindSafe = options.colorblindSafe ?? false;
  const topN = Math.max(1, options.topN ?? 10);
  const bucketCount = Math.max(2, Math.min(options.bucketCount ?? 40, events.length));

  // Count total commits per author
  const commitCounts = new Map<string, number>();
  for (const ev of events) {
    if (hideBots && ev.isBot) continue;
    commitCounts.set(ev.author, (commitCounts.get(ev.author) ?? 0) + 1);
  }

  const rankedAuthors = [...commitCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);

  const primaryIds = rankedAuthors.slice(0, topN);
  const primarySet = new Set(primaryIds);
  const hasOther = rankedAuthors.length > topN;

  const seriesKeys = hasOther ? [...primaryIds, '__other__'] : primaryIds;
  const rawMatrix = new Map<string, number[]>();
  for (const key of seriesKeys) {
    rawMatrix.set(key, new Array<number>(bucketCount).fill(0));
  }

  const bucketEventIndices: number[] = [];
  for (let b = 0; b < bucketCount; b++) {
    bucketEventIndices.push(Math.floor((b / Math.max(1, bucketCount - 1)) * (events.length - 1)));
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (hideBots && ev.isBot) continue;
    const b = Math.min(bucketCount - 1, Math.floor((i / events.length) * bucketCount));
    const key = primarySet.has(ev.author) ? ev.author : '__other__';
    const arr = rawMatrix.get(key);
    if (arr) {
      arr[b] = (arr[b] ?? 0) + 1;
    }
  }

  // Compute silhouette-centered stack (each bucket centered around y = 0)
  const totalsPerBucket = new Array<number>(bucketCount).fill(0);
  for (const arr of rawMatrix.values()) {
    for (let b = 0; b < bucketCount; b++) {
      totalsPerBucket[b] = totalsPerBucket[b]! + arr[b]!;
    }
  }

  const runningY = totalsPerBucket.map((total) => -total / 2);
  let minY = 0;
  let maxY = 0;
  let maxStackHeight = 0;
  for (const total of totalsPerBucket) {
    if (total > maxStackHeight) maxStackHeight = total;
  }

  const series: ContributorSeries[] = seriesKeys.map((key) => {
    const arr = rawMatrix.get(key)!;
    const isOther = key === '__other__';
    const authorMeta = isOther ? undefined : history.authors[key];
    const name = isOther ? 'Other contributors' : (authorMeta?.name ?? key);
    const isBot = isOther ? false : Boolean(authorMeta?.isBot);
    const color = isOther ? '#64748b' : getPaletteColor(key, colorblindSafe);
    let totalCommits = 0;

    const points: StreamPoint[] = arr.map((val, b) => {
      totalCommits += val;
      const y0 = runningY[b]!;
      const y1 = y0 + val;
      runningY[b] = y1;
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
      return {
        bucketIndex: b,
        eventIndex: bucketEventIndices[b]!,
        value: val,
        y0,
        y1,
      };
    });

    return {
      authorId: key,
      name,
      initials: isOther ? '+' : getAuthorInitials(name),
      color,
      isBot,
      totalCommits,
      points,
    };
  });

  return {
    bucketCount,
    bucketEventIndices,
    series,
    minY,
    maxY,
    maxStackHeight,
  };
}

/**
 * Returns contributors active around `eventIndex` (within trailing `windowSize` commits)
 * along with the files they touched, so avatars can gravitate toward those files (`FR-18`).
 */
export function computeActiveContributors(
  history: History,
  eventIndex: number,
  options: { windowSize?: number; hideBots?: boolean; colorblindSafe?: boolean } = {},
): ActiveContributor[] {
  const events = history.events;
  if (events.length === 0 || eventIndex < 0) return [];

  const clamped = Math.min(events.length - 1, Math.floor(eventIndex));
  const windowSize = Math.max(1, options.windowSize ?? 12);
  const start = Math.max(0, clamped - windowSize + 1);
  const hideBots = options.hideBots ?? false;
  const colorblindSafe = options.colorblindSafe ?? false;

  const byAuthor = new Map<string, ActiveContributor>();

  for (let i = clamped; i >= start; i--) {
    const ev = events[i]!;
    if (hideBots && ev.isBot) continue;

    const recency = 1 - (clamped - i) / windowSize;
    let entry = byAuthor.get(ev.author);
    if (!entry) {
      const meta = history.authors[ev.author];
      const name = meta?.name ?? ev.author;
      entry = {
        authorId: ev.author,
        name,
        initials: getAuthorInitials(name),
        color: getPaletteColor(ev.author, colorblindSafe),
        isBot: ev.isBot || Boolean(meta?.isBot),
        recency,
        touchedPaths: [],
      };
      byAuthor.set(ev.author, entry);
    }

    for (const ch of ev.changes) {
      if (entry.touchedPaths.length < 16 && !entry.touchedPaths.includes(ch.path)) {
        entry.touchedPaths.push(ch.path);
      }
    }
  }

  return [...byAuthor.values()].sort((a, b) => b.recency - a.recency);
}
