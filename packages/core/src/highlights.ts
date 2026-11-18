import { getTopLevelDir } from './sanitize.js';
import type { Chapter, Highlight, History } from './types.js';

const THIRTY_DAYS_SEC = 30 * 86400;

/**
 * Builds chronologically ordered documentary chapters from Git tags (`FR-9`).
 */
export function buildChapters(history: History): Chapter[] {
  if (history.events.length === 0 || history.tags.length === 0) return [];

  const indexByHash = new Map<string, number>();
  for (let i = 0; i < history.events.length; i++) {
    indexByHash.set(history.events[i]!.hash, i);
  }

  const chapters: Chapter[] = [];
  for (const tag of history.tags) {
    let eventIndex = indexByHash.get(tag.hash);
    if (eventIndex === undefined && tag.t > 0) {
      // Fallback for aggregated histories: nearest event by timestamp
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < history.events.length; i++) {
        const dist = Math.abs(history.events[i]!.t - tag.t);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      eventIndex = bestIdx;
    }
    if (eventIndex !== undefined) {
      chapters.push({
        name: tag.name,
        hash: tag.hash,
        eventIndex,
        t: tag.t || history.events[eventIndex]!.t,
      });
    }
  }

  chapters.sort((a, b) => a.eventIndex - b.eventIndex || a.name.localeCompare(b.name));
  return chapters;
}

/**
 * Automatically detects narrative documentary highlights (`FR-15`):
 * - Release tags (`release_tag`)
 * - First appearance of a top-level directory (`new_top_dir`)
 * - Largest commits by churn (`largest_commit`)
 * - Mass deletions / refactors (`mass_refactor`)
 * - Contributor surges (`contributor_surge`)
 */
export function detectHighlights(history: History): Highlight[] {
  const events = history.events;
  if (events.length === 0) return [];

  const highlights: Highlight[] = [];
  const seenKey = new Set<string>();

  const pushHighlight = (h: Highlight): void => {
    const key = `${h.eventIndex}:${h.type}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    highlights.push(h);
  };

  // 1. Release tags
  const chapters = buildChapters(history);
  for (const ch of chapters) {
    pushHighlight({
      id: `hl:tag:${ch.eventIndex}:${ch.name}`,
      type: 'release_tag',
      eventIndex: ch.eventIndex,
      hash: ch.hash,
      t: ch.t,
      score: 1.0,
      title: `Release ${ch.name}`,
      detail: `Tagged release milestone ${ch.name}`,
    });
  }

  // 2. First appearance of a top-level directory + compute churn stats + mass refactors
  const seenTopDirs = new Set<string>();
  const churns: number[] = new Array<number>(events.length);
  let sumChurn = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    let addTotal = 0;
    let delTotal = 0;
    let deletedOrRenamed = 0;
    const newlyIntroducedDirs: string[] = [];

    for (const ch of ev.changes) {
      addTotal += ch.add;
      delTotal += ch.del;
      if (ch.type === 'D' || ch.type === 'R') {
        deletedOrRenamed += 1;
      }
      if (ch.type === 'A' || ch.type === 'R' || ch.type === 'C') {
        const top = getTopLevelDir(ch.path);
        if (top && !seenTopDirs.has(top)) {
          seenTopDirs.add(top);
          newlyIntroducedDirs.push(top);
        }
      }
    }

    if (newlyIntroducedDirs.length > 0 && i > 0) {
      pushHighlight({
        id: `hl:dir:${i}:${newlyIntroducedDirs[0]}`,
        type: 'new_top_dir',
        eventIndex: i,
        hash: ev.hash,
        t: ev.t,
        score: 0.75,
        title: `New subsystem: ${newlyIntroducedDirs[0]}/`,
        detail:
          newlyIntroducedDirs.length === 1
            ? `Introduced top-level directory ${newlyIntroducedDirs[0]}/`
            : `Introduced ${newlyIntroducedDirs.map((d) => `${d}/`).join(', ')}`,
      });
    }

    // Mass deletions / refactors
    if (
      !ev.isBot &&
      (deletedOrRenamed >= 5 || (delTotal >= 200 && delTotal > addTotal * 1.5))
    ) {
      pushHighlight({
        id: `hl:refactor:${i}`,
        type: 'mass_refactor',
        eventIndex: i,
        hash: ev.hash,
        t: ev.t,
        score: 0.85,
        title: 'Major refactor / cleanup',
        detail: `${deletedOrRenamed} files deleted/renamed (-${delTotal.toLocaleString()} lines)`,
      });
    }

    const churn = ev.isBot ? 0 : addTotal + delTotal + ev.changes.length * 10;
    churns[i] = churn;
    sumChurn += churn;
  }

  // 3. Largest commits (statistical outliers > mean + 2.2 * stddev, capped cleanly)
  const mean = sumChurn / events.length;
  let variance = 0;
  for (let i = 0; i < events.length; i++) {
    const diff = churns[i]! - mean;
    variance += diff * diff;
  }
  const stddev = Math.sqrt(variance / events.length);
  const threshold = Math.max(150, mean + 2.2 * stddev);

  const largeCandidates: Array<{ index: number; churn: number }> = [];
  for (let i = 0; i < events.length; i++) {
    const c = churns[i]!;
    if (c >= threshold) {
      largeCandidates.push({ index: i, churn: c });
    }
  }
  largeCandidates.sort((a, b) => b.churn - a.churn);
  const maxLarge = Math.min(8, Math.max(3, Math.floor(events.length / 40)));
  for (const cand of largeCandidates.slice(0, maxLarge)) {
    const ev = events[cand.index]!;
    pushHighlight({
      id: `hl:large:${cand.index}`,
      type: 'largest_commit',
      eventIndex: cand.index,
      hash: ev.hash,
      t: ev.t,
      score: Math.min(0.95, 0.72 + Math.min(0.23, cand.churn / Math.max(1, threshold * 4))),
      title: 'Landmark commit',
      detail: `${ev.changes.length} files touched — ${ev.message.slice(0, 64)}`,
    });
  }

  // 4. Contributor surges (rolling 30-day window jumps >= 2x with >= +3 contributors)
  if (events.length >= 4) {
    let lastSurgeIndex = -100;
    for (let i = 3; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.isBot || i - lastSurgeIndex < 4) continue;

      const curStart = ev.t - THIRTY_DAYS_SEC;
      const prevStart = curStart - THIRTY_DAYS_SEC;
      const curAuthors = new Set<string>();
      const prevAuthors = new Set<string>();

      for (let j = i; j >= 0; j--) {
        const e = events[j]!;
        if (e.t < prevStart) break;
        if (e.isBot) continue;
        if (e.t >= curStart) curAuthors.add(e.author);
        else prevAuthors.add(e.author);
      }

      const prevCount = prevAuthors.size;
      const curCount = curAuthors.size;
      if (curCount >= prevCount + 3 && curCount >= Math.max(4, prevCount * 2)) {
        lastSurgeIndex = i;
        pushHighlight({
          id: `hl:surge:${i}`,
          type: 'contributor_surge',
          eventIndex: i,
          hash: ev.hash,
          t: ev.t,
          score: 0.8,
          title: 'Contributor surge',
          detail: `${curCount} active contributors in 30 days (up from ${prevCount})`,
        });
      }
    }
  }

  highlights.sort((a, b) => a.eventIndex - b.eventIndex || b.score - a.score);
  return highlights;
}
