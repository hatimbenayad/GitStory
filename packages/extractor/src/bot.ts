const DEFAULT_BOT_PATTERNS: readonly RegExp[] = [
  /\[bot\]$/i,
  /^dependabot\b/i,
  /^renovate\b/i,
  /^github-actions\b/i,
  /^greenkeeper\b/i,
  /^snyk-bot\b/i,
  /^semantic-release-bot\b/i,
  /^mergify\b/i,
  /^codecov\b/i,
  /^allcontributors\b/i,
  /^imgbot\b/i,
  /^pre-commit-ci\b/i,
  /^vercel\b/i,
  /^netlify\b/i,
  /\bbot@renovateapp\.com$/i,
  /\bdependabot.*@users\.noreply\.github\.com$/i,
  /\bgithub-actions.*@users\.noreply\.github\.com$/i,
  /\baction@github\.com$/i,
];

/**
 * Returns `true` when an author name or email matches known automated bot heuristics (`FR-8`).
 */
export function detectBot(name: string, email = '', extraPatterns: readonly RegExp[] = []): boolean {
  const n = name.trim();
  const e = email.trim();
  const patterns = extraPatterns.length > 0 ? [...DEFAULT_BOT_PATTERNS, ...extraPatterns] : DEFAULT_BOT_PATTERNS;

  for (const re of patterns) {
    if (re.test(n) || (e.length > 0 && re.test(e))) {
      return true;
    }
  }
  return false;
}
