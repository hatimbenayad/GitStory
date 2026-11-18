import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assertValidHistory, type History, type TagInfo } from '@gitstory/core';
import { parseMailmap, type MailmapTable } from './mailmap.js';
import { parseGitLogStream } from './stream-parser.js';

const execFileAsync = promisify(execFile);

export interface ExtractOptions {
  /** Local filesystem path to the Git repository. */
  repoPath: string;
  /** Follow first-parent mainline only (`true` by default, `FR-10`). */
  firstParent?: boolean;
  /** Optional maximum number of commits to extract. */
  maxCommits?: number;
  /** Optional override for inferred repository display name. */
  repoName?: string;
  /** Additional regexes used to classify automated bots. */
  extraBotPatterns?: readonly RegExp[];
  /** Optional progress callback fired per parsed commit. */
  onProgress?: (commitsParsed: number) => void;
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function verifyGitRepo(repoPath: string): Promise<void> {
  try {
    const out = await runGit(repoPath, ['rev-parse', '--is-inside-work-tree']);
    if (out.trim() === 'true') return;
  } catch {
    // Check if bare repository (e.g., blobless --no-checkout or bare clone)
    try {
      const bare = await runGit(repoPath, ['rev-parse', '--is-bare-repository']);
      if (bare.trim() === 'true') return;
    } catch {
      // fall through
    }
  }
  throw new Error(`Not a valid Git repository: "${repoPath}"`);
}

async function resolveHead(repoPath: string): Promise<string | null> {
  try {
    const out = await runGit(repoPath, ['rev-parse', '--verify', 'HEAD']);
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function resolveBranch(repoPath: string): Promise<string | undefined> {
  try {
    const out = await runGit(repoPath, ['symbolic-ref', '--short', 'HEAD']);
    const branch = out.trim();
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

async function extractTags(repoPath: string): Promise<TagInfo[]> {
  try {
    const out = await runGit(repoPath, [
      'for-each-ref',
      '--sort=creatordate',
      '--format=%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:unix)',
      'refs/tags',
    ]);
    const tags: TagInfo[] = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, derefHash, objHash, tsRaw] = line.split('\t');
      const hash = (derefHash && derefHash.length > 0 ? derefHash : objHash) ?? '';
      const ts = Number.parseInt(tsRaw ?? '0', 10);
      if (name && hash) {
        tags.push({
          name,
          hash,
          t: Number.isFinite(ts) && ts >= 0 ? ts : 0,
        });
      }
    }
    tags.sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));
    return tags;
  } catch {
    return [];
  }
}

function loadRepoMailmap(repoPath: string): MailmapTable | undefined {
  const mailmapPath = join(repoPath, '.mailmap');
  if (!existsSync(mailmapPath)) return undefined;
  try {
    const content = readFileSync(mailmapPath, 'utf8');
    return parseMailmap(content);
  } catch {
    return undefined;
  }
}

/**
 * Extracts a validated GitStory `History` (schema v1) from a local Git repository
 * using a single streaming `git log` invocation (`FR-6`–`FR-12`).
 */
export async function extractHistory(options: ExtractOptions): Promise<History> {
  const repoPath = resolve(options.repoPath);
  const firstParent = options.firstParent ?? true;
  await verifyGitRepo(repoPath);

  const repoName = options.repoName ?? (basename(repoPath).replace(/\.git$/, '') || 'repository');
  const defaultBranch = await resolveBranch(repoPath);
  const head = await resolveHead(repoPath);

  // Empty / unborn repository
  if (!head) {
    return assertValidHistory({
      schemaVersion: 1,
      repo: {
        name: repoName,
        head: '',
        ...(defaultBranch ? { defaultBranch } : {}),
      },
      authors: {},
      tags: [],
      events: [],
    });
  }

  const tags = await extractTags(repoPath);
  const mailmap = loadRepoMailmap(repoPath);

  const args = [
    '-c',
    'core.quotepath=false',
    'log',
    '--reverse',
    '--date-order',
    '-M',
    '-C',
    '--use-mailmap',
    '--raw',
    '--numstat',
    '-z',
    '--format=%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%s%x1e',
  ];

  if (firstParent) {
    args.push('--first-parent', '-m');
  }

  if (options.maxCommits !== undefined && options.maxCommits > 0) {
    args.push('-n', String(Math.floor(options.maxCommits)));
  }

  const child = spawn('git', args, {
    cwd: repoPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderrBuf.length < 8192) {
      stderrBuf += chunk.toString('utf8');
    }
  });

  const exitPromise = new Promise<number | null>((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('close', (code) => resolveExit(code));
  });

  const { events, authors } = await parseGitLogStream(child.stdout, {
    ...(mailmap ? { mailmap } : {}),
    ...(options.extraBotPatterns ? { extraBotPatterns: options.extraBotPatterns } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  });

  const exitCode = await exitPromise;
  if (exitCode !== 0) {
    throw new Error(`git log exited with code ${String(exitCode)}: ${stderrBuf.trim()}`);
  }

  return assertValidHistory({
    schemaVersion: 1,
    repo: {
      name: repoName,
      head,
      ...(defaultBranch ? { defaultBranch } : {}),
    },
    authors,
    tags,
    events,
  });
}
