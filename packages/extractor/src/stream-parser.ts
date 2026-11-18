import { StringDecoder } from 'node:string_decoder';
import {
  normalizeRepoPath,
  stripControlChars,
  type AuthorInfo,
  type CommitEvent,
  type FileChange,
  type FileChangeType,
} from '@gitstory/core';
import { detectBot } from './bot.js';
import { resolveAuthorWithMailmap, type MailmapTable } from './mailmap.js';

export interface ParseStreamOptions {
  mailmap?: MailmapTable;
  extraBotPatterns?: readonly RegExp[];
  onProgress?: (commitsParsed: number) => void;
}

interface PendingCommit {
  hash: string;
  parents: string[];
  t: number;
  author: string;
  message: string;
  isBot: boolean;
  rawChanges: FileChange[];
  statsByPath: Map<string, { add: number; del: number }>;
}

const RS = '\x1e';
const US = '\x1f';

function mapStatusChar(statusToken: string): FileChangeType | null {
  const ch = statusToken.charAt(0);
  if (ch === 'A' || ch === 'M' || ch === 'D' || ch === 'R' || ch === 'C') {
    return ch;
  }
  if (ch === 'T') {
    return 'M';
  }
  return null;
}

function safeNormalize(rawPath: string): string | null {
  try {
    return normalizeRepoPath(rawPath);
  } catch {
    return null;
  }
}

function parseStatNumber(token: string): number {
  if (token === '-' || token.length === 0) return 0;
  const n = Number.parseInt(token, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Incrementally parses a NUL-delimited `git log --raw --numstat -z` stream (`ADR-001`, `FR-12`).
 * Never buffers the entire git output into a single string.
 */
export async function parseGitLogStream(
  stream: AsyncIterable<Buffer | string>,
  options: ParseStreamOptions = {},
): Promise<{ events: CommitEvent[]; authors: Record<string, AuthorInfo> }> {
  const decoder = new StringDecoder('utf8');
  const events: CommitEvent[] = [];
  const authors: Record<string, AuthorInfo> = {};
  const seenHashes = new Set<string>();

  let residual = '';
  let current: PendingCommit | null = null;
  let expectingMode:
    | 'none'
    | 'raw-single'
    | 'raw-pair-from'
    | 'raw-pair-to'
    | 'numstat-pair-from'
    | 'numstat-pair-to' = 'none';
  let pendingRawType: FileChangeType = 'M';
  let pendingFromPath = '';
  let pendingAdd = 0;
  let pendingDel = 0;

  const flushCommit = (): void => {
    if (!current) return;
    // Merge numstat line counts into raw file changes
    const changes: FileChange[] = [];
    const seenPaths = new Set<string>();

    for (const ch of current.rawChanges) {
      const stat = current.statsByPath.get(ch.path);
      changes.push({
        ...ch,
        add: stat?.add ?? ch.add,
        del: stat?.del ?? ch.del,
      });
      seenPaths.add(ch.path);
    }

    // Defensive fallback if any numstat entry was not present in raw entries
    for (const [path, stat] of current.statsByPath.entries()) {
      if (!seenPaths.has(path)) {
        changes.push({
          path,
          type: 'M',
          add: stat.add,
          del: stat.del,
        });
      }
    }

    // Deduplicate identical hashes (e.g. if git emits duplicate merge parent records)
    if (!seenHashes.has(current.hash)) {
      seenHashes.add(current.hash);
      events.push({
        hash: current.hash,
        parents: current.parents,
        t: current.t,
        author: current.author,
        message: current.message,
        isBot: current.isBot,
        changes,
      });
      options.onProgress?.(events.length);
    }

    current = null;
    expectingMode = 'none';
  };

  const startCommitHeader = (headerBody: string): void => {
    flushCommit();
    const parts = headerBody.split(US);
    const hash = (parts[0] ?? '').trim();
    if (hash.length === 0) return;

    const parentsRaw = (parts[1] ?? '').trim();
    const parents = parentsRaw.length > 0 ? parentsRaw.split(/\s+/).filter(Boolean) : [];
    const rawName = stripControlChars((parts[2] ?? '').trim()) || 'Unknown';
    const rawEmail = stripControlChars((parts[3] ?? '').trim());
    const resolved = resolveAuthorWithMailmap(rawName, rawEmail, options.mailmap);
    const ts = Number.parseInt((parts[4] ?? '0').trim(), 10);
    const t = Number.isFinite(ts) && ts >= 0 ? ts : 0;
    const message = stripControlChars((parts[5] ?? '').trim());
    const isBot = detectBot(resolved.name, resolved.email, options.extraBotPatterns);

    const authorKey = resolved.email.length > 0 ? resolved.email.toLowerCase() : resolved.name;
    const existingAuthor = authors[authorKey];
    if (!existingAuthor) {
      authors[authorKey] = {
        name: resolved.name,
        ...(resolved.email.length > 0 ? { email: resolved.email } : {}),
        isBot,
      };
    } else if (isBot && !existingAuthor.isBot) {
      existingAuthor.isBot = true;
    }

    current = {
      hash,
      parents,
      t,
      author: authorKey,
      message,
      isBot,
      rawChanges: [],
      statsByPath: new Map(),
    };
  };

  const processToken = (token: string): void => {
    if (expectingMode === 'raw-single') {
      const normalized = safeNormalize(token);
      if (current && normalized) {
        current.rawChanges.push({
          path: normalized,
          type: pendingRawType,
          add: 0,
          del: 0,
        });
      }
      expectingMode = 'none';
      return;
    }

    if (expectingMode === 'raw-pair-from') {
      pendingFromPath = token;
      expectingMode = 'raw-pair-to';
      return;
    }

    if (expectingMode === 'raw-pair-to') {
      const fromNorm = safeNormalize(pendingFromPath);
      const toNorm = safeNormalize(token);
      if (current && fromNorm && toNorm) {
        current.rawChanges.push({
          path: toNorm,
          from: fromNorm,
          type: pendingRawType,
          add: 0,
          del: 0,
        });
      }
      expectingMode = 'none';
      return;
    }

    if (expectingMode === 'numstat-pair-from') {
      pendingFromPath = token;
      expectingMode = 'numstat-pair-to';
      return;
    }

    if (expectingMode === 'numstat-pair-to') {
      const toNorm = safeNormalize(token);
      if (current && toNorm) {
        current.statsByPath.set(toNorm, { add: pendingAdd, del: pendingDel });
      }
      expectingMode = 'none';
      return;
    }

    // Handle commit header markers `\x1e...\x1e` (possibly preceded by leading newlines/whitespace)
    const trimmedStart = token.replace(/^\r?\n+/, '');
    if (trimmedStart.length === 0) return;

    if (trimmedStart.startsWith(RS)) {
      const endIdx = trimmedStart.indexOf(RS, 1);
      if (endIdx !== -1) {
        startCommitHeader(trimmedStart.slice(1, endIdx));
      }
      return;
    }

    // Handle `--raw` entry: `:oldmode newmode oldsha newsha STATUS`
    if (trimmedStart.startsWith(':')) {
      const lastSpace = trimmedStart.lastIndexOf(' ');
      if (lastSpace !== -1) {
        const statusToken = trimmedStart.slice(lastSpace + 1).trim();
        const mapped = mapStatusChar(statusToken);
        if (mapped) {
          pendingRawType = mapped;
          expectingMode = mapped === 'R' || mapped === 'C' ? 'raw-pair-from' : 'raw-single';
        }
      }
      return;
    }

    // Handle `--numstat` entry: `<add>\t<del>\t<pathOrEmpty>`
    const firstTab = trimmedStart.indexOf('\t');
    if (firstTab !== -1) {
      const secondTab = trimmedStart.indexOf('\t', firstTab + 1);
      if (secondTab !== -1) {
        const add = parseStatNumber(trimmedStart.slice(0, firstTab));
        const del = parseStatNumber(trimmedStart.slice(firstTab + 1, secondTab));
        const rest = trimmedStart.slice(secondTab + 1);
        if (rest.length === 0) {
          // Rename or copy in `-z --numstat`: next two tokens are oldPath, newPath
          pendingAdd = add;
          pendingDel = del;
          expectingMode = 'numstat-pair-from';
        } else {
          const norm = safeNormalize(rest);
          if (current && norm) {
            current.statsByPath.set(norm, { add, del });
          }
        }
      }
    }
  };

  for await (const chunk of stream) {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    residual += text;

    let nulIdx = residual.indexOf('\0');
    while (nulIdx !== -1) {
      const token = residual.slice(0, nulIdx);
      residual = residual.slice(nulIdx + 1);
      processToken(token);
      nulIdx = residual.indexOf('\0');
    }
  }

  const tail = residual + decoder.end();
  if (tail.length > 0) {
    processToken(tail);
  }
  flushCommit();

  return { events, authors };
}
