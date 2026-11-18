import git from 'isomorphic-git';
import {
  assertValidHistory,
  normalizeRepoPath,
  stripControlChars,
  type AuthorInfo,
  type CommitEvent,
  type FileChange,
  type History,
  type TagInfo,
} from '@gitstory/core';

interface FsaWindow extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

/**
 * Detects whether the current browser supports the File System Access API (`FR-4`).
 */
export function isLocalFolderSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as FsaWindow).showDirectoryPicker === 'function';
}

const BOT_RE = /\[bot\]$|^dependabot\b|^renovate\b|^github-actions\b/i;

/**
 * Minimal read-only fs adapter wrapping a browser `FileSystemDirectoryHandle` for `isomorphic-git`.
 */
function createHandleFs(rootHandle: FileSystemDirectoryHandle) {
  const splitParts = (filepath: string): string[] =>
    filepath
      .replace(/\\/g, '/')
      .split('/')
      .filter((p) => p.length > 0 && p !== '.');

  const resolveParent = async (
    filepath: string,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> => {
    const parts = splitParts(filepath);
    if (parts.length === 0) {
      return { dir: rootHandle, name: '' };
    }
    let dir = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]!);
    }
    return { dir, name: parts[parts.length - 1]! };
  };

  const makeEnoent = (p: string): NodeJS.ErrnoException => {
    const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    return err;
  };

  const promises = {
    async readFile(filepath: string, options?: { encoding?: string } | string): Promise<Uint8Array | string> {
      try {
        const { dir, name } = await resolveParent(filepath);
        const fh = await dir.getFileHandle(name);
        const file = await fh.getFile();
        const encoding = typeof options === 'string' ? options : options?.encoding;
        if (encoding === 'utf8') {
          return await file.text();
        }
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        throw makeEnoent(filepath);
      }
    },
    async readdir(filepath: string): Promise<string[]> {
      try {
        const parts = splitParts(filepath);
        let dir = rootHandle;
        for (const p of parts) {
          dir = await dir.getDirectoryHandle(p);
        }
        const entries: string[] = [];
        for await (const [name] of (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
          entries.push(name);
        }
        return entries;
      } catch {
        throw makeEnoent(filepath);
      }
    },
    async stat(filepath: string) {
      const parts = splitParts(filepath);
      if (parts.length === 0) {
        return {
          type: 'dir',
          mode: 0o040755,
          size: 0,
          ino: 0,
          mtimeMs: 0,
          ctimeMs: 0,
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
        };
      }
      try {
        const { dir, name } = await resolveParent(filepath);
        try {
          const fh = await dir.getFileHandle(name);
          const f = await fh.getFile();
          return {
            type: 'file',
            mode: 0o100644,
            size: f.size,
            ino: 0,
            mtimeMs: f.lastModified,
            ctimeMs: f.lastModified,
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
          };
        } catch {
          await dir.getDirectoryHandle(name);
          return {
            type: 'dir',
            mode: 0o040755,
            size: 0,
            ino: 0,
            mtimeMs: 0,
            ctimeMs: 0,
            isFile: () => false,
            isDirectory: () => true,
            isSymbolicLink: () => false,
          };
        }
      } catch {
        throw makeEnoent(filepath);
      }
    },
    async lstat(filepath: string) {
      return promises.stat(filepath);
    },
    async readlink(filepath: string): Promise<string> {
      throw makeEnoent(filepath);
    },
    async writeFile(): Promise<void> {
      throw new Error('GitStory local folder reader is strictly read-only');
    },
    async unlink(): Promise<void> {
      throw new Error('GitStory local folder reader is strictly read-only');
    },
    async mkdir(): Promise<void> {
      throw new Error('GitStory local folder reader is strictly read-only');
    },
    async rmdir(): Promise<void> {
      throw new Error('GitStory local folder reader is strictly read-only');
    },
    async symlink(): Promise<void> {
      throw new Error('GitStory local folder reader is strictly read-only');
    },
  };

  return { promises };
}

/**
 * Reads a local Git repository folder directly in the browser using the File System Access API
 * and `isomorphic-git` without uploading any data (`FR-4`).
 */
export async function loadHistoryFromLocalFolder(maxCommits = 400): Promise<History> {
  const picker = (window as FsaWindow).showDirectoryPicker;
  if (!picker) {
    throw new Error(
      'Your browser does not support the File System Access API. Run `npx gitstory <repo-path>` and drop the generated history.json here.',
    );
  }

  const rootHandle = await picker();
  const fs = createHandleFs(rootHandle);

  const commits = await git.log({ fs, dir: '/', depth: maxCommits });
  const chronological = [...commits].reverse();

  const authors: Record<string, AuthorInfo> = {};
  const events: CommitEvent[] = [];

  // Map previous commit tree paths -> oid for lightweight diffing
  let prevFiles = new Map<string, string>();

  const listCommitTree = async (oid: string): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    const walk = async (treeOid: string, prefix: string): Promise<void> => {
      const { tree } = await git.readTree({ fs, dir: '/', oid: treeOid });
      for (const entry of tree) {
        const full = prefix ? `${prefix}/${entry.path}` : entry.path;
        if (entry.type === 'tree') {
          await walk(entry.oid, full);
        } else if (entry.type === 'blob') {
          out.set(full, entry.oid);
        }
      }
    };
    await walk(oid, '');
    return out;
  };

  for (const item of chronological) {
    const authorName = stripControlChars(item.commit.author.name || 'Unknown');
    const authorEmail = stripControlChars(item.commit.author.email || '');
    const isBot = BOT_RE.test(authorName) || BOT_RE.test(authorEmail);
    const authorKey = authorEmail ? authorEmail.toLowerCase() : authorName;

    if (!authors[authorKey]) {
      authors[authorKey] = {
        name: authorName,
        ...(authorEmail ? { email: authorEmail } : {}),
        isBot,
      };
    }

    const curFiles = await listCommitTree(item.oid);
    const changes: FileChange[] = [];

    for (const [path, oid] of curFiles.entries()) {
      const prevOid = prevFiles.get(path);
      if (!prevOid) {
        changes.push({ path: normalizeRepoPath(path), type: 'A', add: 25, del: 0 });
      } else if (prevOid !== oid) {
        changes.push({ path: normalizeRepoPath(path), type: 'M', add: 8, del: 4 });
      }
    }
    for (const path of prevFiles.keys()) {
      if (!curFiles.has(path)) {
        changes.push({ path: normalizeRepoPath(path), type: 'D', add: 0, del: 20 });
      }
    }
    prevFiles = curFiles;

    events.push({
      hash: item.oid,
      parents: item.commit.parent,
      t: Math.max(0, Math.floor(item.commit.author.timestamp)),
      author: authorKey,
      message: stripControlChars((item.commit.message.split(/\r?\n/)[0] ?? '').trim()),
      isBot,
      changes,
    });
  }

  const tagNames = await git.listTags({ fs, dir: '/' }).catch(() => [] as string[]);
  const tags: TagInfo[] = [];
  for (const name of tagNames) {
    try {
      const hash = await git.resolveRef({ fs, dir: '/', ref: `refs/tags/${name}` });
      const matching = events.find((e) => e.hash === hash);
      tags.push({ name, hash, t: matching?.t ?? 0 });
    } catch {
      // skip unresolvable tags
    }
  }
  tags.sort((a, b) => a.t - b.t || a.name.localeCompare(b.name));

  return assertValidHistory({
    schemaVersion: 1,
    repo: {
      name: rootHandle.name || 'local-repo',
      head: chronological[chronological.length - 1]?.oid ?? '',
    },
    authors,
    tags,
    events,
  });
}
