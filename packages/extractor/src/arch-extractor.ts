import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { getFileExtension } from '@gitstory/core';

const execFileAsync = promisify(execFile);

const SUPPORTED_EXTS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py']);

/**
 * Reads supported source files (`TS/JS/Python`) at a given Git ref (`tag` or `commit`)
 * strictly read-only via `git ls-tree` and `git show` without checking out or mutating the repo (`FR-24`).
 */
export async function readRepoFilesAtRef(
  repoPath: string,
  ref: string,
  maxFiles = 500,
): Promise<Map<string, string>> {
  const cwd = resolve(repoPath);
  const { stdout: listOut } = await execFileAsync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', '-z', ref],
    { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
  );

  const paths = listOut
    .split('\0')
    .filter((p) => p.length > 0 && SUPPORTED_EXTS.has(getFileExtension(p)))
    .slice(0, maxFiles);

  const files = new Map<string, string>();
  for (const p of paths) {
    try {
      const { stdout } = await execFileAsync('git', ['show', `${ref}:${p}`], {
        cwd,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      files.set(p, stdout);
    } catch {
      // Skip unreadable or submodule entries
    }
  }
  return files;
}
