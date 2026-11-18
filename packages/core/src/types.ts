/**
 * Canonical file change status emitted by GitStory extraction.
 * - `A`: Added
 * - `M`: Modified
 * - `D`: Deleted
 * - `R`: Renamed (`from` specifies original path)
 * - `C`: Copied (`from` specifies source path)
 */
export type FileChangeType = 'A' | 'M' | 'D' | 'R' | 'C';

/**
 * Single file mutation within a commit event.
 */
export interface FileChange {
  /** Normalized POSIX relative path (no leading slash, no `..`). */
  path: string;
  /** Change operation type. */
  type: FileChangeType;
  /** Source path for renames (`R`) and copies (`C`). */
  from?: string;
  /** Non-negative count of lines added (0 for binary files). */
  add: number;
  /** Non-negative count of lines removed (0 for binary files). */
  del: number;
}

/**
 * Single chronological commit event in a GitStory history.
 */
export interface CommitEvent {
  /** Git commit SHA (hex string). */
  hash: string;
  /** Parent commit SHAs (empty for root commits). */
  parents: string[];
  /** Commit author timestamp in Unix seconds. */
  t: number;
  /** Canonical author key referencing `History.authors`. */
  author: string;
  /** First line of the commit message. */
  message: string;
  /** Whether this commit was authored by an automated bot. */
  isBot: boolean;
  /** Ordered list of file changes in this commit. */
  changes: FileChange[];
}

/**
 * Canonical contributor metadata after `.mailmap` normalization.
 */
export interface AuthorInfo {
  name: string;
  email?: string;
  isBot: boolean;
}

/**
 * Git tag acting as a documentary chapter marker.
 */
export interface TagInfo {
  name: string;
  hash: string;
  t: number;
}

/**
 * Repository identity and snapshot metadata.
 */
export interface RepoMetadata {
  name: string;
  head: string;
  defaultBranch?: string;
}

/**
 * Versioned `history.json` root document (Schema v1).
 */
export interface History {
  schemaVersion: 1;
  repo: RepoMetadata;
  authors: Record<string, AuthorInfo>;
  tags: TagInfo[];
  events: CommitEvent[];
}

/**
 * Documentary highlight classification (`FR-15`).
 */
export type HighlightType =
  | 'largest_commit'
  | 'new_top_dir'
  | 'contributor_surge'
  | 'release_tag'
  | 'mass_refactor';

/**
 * Detected narrative highlight attached to a commit index.
 */
export interface Highlight {
  id: string;
  type: HighlightType;
  eventIndex: number;
  hash: string;
  t: number;
  /** Importance score in `[0, 1]`. */
  score: number;
  title: string;
  detail: string;
}

/**
 * Documentary chapter derived from a Git tag (`FR-9`).
 */
export interface Chapter {
  name: string;
  hash: string;
  eventIndex: number;
  t: number;
}

/**
 * Optional documentary narration segment (`FR-28`).
 */
export interface NarrationSegment {
  eventIndex: number;
  t: number;
  title: string;
  text: string;
}

/**
 * Pluggable narration provider interface (`FR-28`).
 * Disabled by default; never ships or requires API keys in the repository.
 */
export interface NarrationProvider {
  readonly name: string;
  generate(input: {
    repoName: string;
    chapters: Chapter[];
    highlights: Highlight[];
  }): Promise<NarrationSegment[]>;
}

/**
 * Structured validation error returned by `validateHistory`.
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Discriminated union result from `validateHistory`.
 */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationError[] };
