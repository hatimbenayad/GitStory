# Spec: U2 — Git Extractor & CLI `history.json` Output

## 1. Purpose & Why
GitStory is local-first: users need a fast, memory-bounded way to extract complete, accurate repository history from any local Git repository—including private or massive repos—using real `git`. U2 delivers `@gitstory/extractor` and the `gitstory` CLI (`apps/cli`).

## 2. Functional Requirements Covered
- `FR-1`: CLI accepts a local repo path and outputs schema-valid `history.json`.
- `FR-2`: CLI supports `--serve` / `serve` subcommand to serve the web app on localhost preloaded with the extracted repo (fully wired once U6 builds `apps/web/dist`).
- `FR-6`: Single streaming `git log` command with delimiter-safe format extracting commit hash, parents, author, timestamp, first-line message, file status (`A/M/D/R/C`), rename/copy `from`, `add`, and `del`.
- `FR-7`: Apply `.mailmap` to merge duplicate author identities.
- `FR-8`: Detect bot authors and flag `isBot: true`.
- `FR-9`: Extract lightweight and annotated tags as `{ name, hash, t }`.
- `FR-10`: Support `firstParent: true` (default) and `firstParent: false` (full history).
- `FR-11`: Handle renames (`-M`) and copies (`-C`) without synthetic delete+add noise.
- `FR-12`: Stream-parse stdout incrementally so memory stays bounded.

## 3. Data Contracts & Public API (`@gitstory/extractor`)
```ts
export interface ExtractOptions {
  repoPath: string;
  firstParent?: boolean;        // default: true
  maxCommits?: number;          // optional cap
  repoName?: string;            // override inferred repo folder name
  extraBotPatterns?: RegExp[];
  onProgress?: (commitsParsed: number) => void;
}

export function extractHistory(options: ExtractOptions): Promise<History>;
export function parseGitLogStream(
  stream: AsyncIterable<Buffer | string>,
  options?: ParseStreamOptions
): Promise<{ events: CommitEvent[]; authors: Record<string, AuthorInfo> }>;
export function detectBot(name: string, email?: string, extraPatterns?: RegExp[]): boolean;
export function parseMailmap(content: string): MailmapTable;
```

## 4. Behavior & Edge Cases
- **Streaming format (per ADR-001):**
  `git -c core.quotepath=false log --reverse --date-order -M -C --use-mailmap --raw --numstat -z --format=%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%s%x1e` (+ `--first-parent -m` when `firstParent !== false`).
- **Bot detection:** Matches `[bot]` suffix, `dependabot`, `renovate`, `github-actions`, `greenkeeper`, `snyk-bot`, `semantic-release-bot`, `mergify`, `codecov`, `allcontributors`, and `noreply` bot emails (case-insensitive).
- **Binary files:** `--numstat` emits `-\t-\t<path>` -> mapped to `add: 0, del: 0`.
- **Empty repository (no commits yet):** Detects unborn `HEAD` gracefully and returns `{ schemaVersion: 1, repo: { name, head: '', defaultBranch }, authors: {}, tags: [], events: [] }`.
- **Detached HEAD:** `defaultBranch` omitted or resolved safely without throwing.
- **Shallow clones:** Extracts all available commits cleanly without failing.
- **Weird filenames:** Spaces, quotes, tabs, non-ASCII Unicode, and apostrophes preserved verbatim via `-z` and `core.quotepath=false`.
- **CLI usage:**
  - `gitstory <path> [-o history.json] [--full-history] [--serve] [--port 4173]`
  - `gitstory extract <path> ...`
  - `gitstory serve <path> [--port 4173]`
  - Clear non-zero exit code & friendly error message if `<path>` is not a git repo or `git` is missing.
