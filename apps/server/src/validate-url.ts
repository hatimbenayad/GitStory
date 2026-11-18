export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  canonicalUrl: string;
  slug: string;
}

const GITHUB_HTTPS_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99}?)(?:\.git)?\/?$/;

/**
 * Strictly validates and normalizes a public GitHub HTTPS repository URL (`FR-5`).
 * Rejects non-GitHub hosts, local paths, SSH URLs, path traversal, and shell metacharacters.
 */
export function parseGitHubRepoUrl(raw: string): ParsedGitHubRepo | null {
  const trimmed = raw.trim();
  const match = GITHUB_HTTPS_RE.exec(trimmed);
  if (!match) return null;

  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, '');
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    return null;
  }
  if (owner.includes('..') || repo.includes('..')) {
    return null;
  }

  return {
    owner,
    repo,
    canonicalUrl: `https://github.com/${owner}/${repo}.git`,
    slug: `${owner}__${repo}`,
  };
}
