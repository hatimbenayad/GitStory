# Spec: U1 — Core Types & `history.json` Schema

## 1. Purpose & Why
All GitStory packages (`extractor`, `layout`, `timeline`, `exporter`, `web`, `cli`, `server`) exchange repository history via a single versioned data contract (`history.json`). U1 establishes the canonical TypeScript types, JSON Schema v1, strict runtime validation, and path/text sanitization primitives so every downstream unit works against an unambiguous, untrusted-input-safe contract.

## 2. Functional Requirements Covered
- Foundation for `FR-1`, `FR-3`, `FR-6`, `FR-15`, `FR-28`.
- Security & robustness requirements from `docs/constitution.md`.

## 3. Data Contracts
```ts
export type FileChangeType = 'A' | 'M' | 'D' | 'R' | 'C';

export interface FileChange {
  path: string;        // Normalized POSIX relative path (no leading slash, no '..')
  type: FileChangeType;
  from?: string;       // Required when type is 'R' or 'C'
  add: number;         // Non-negative integer (>= 0)
  del: number;         // Non-negative integer (>= 0)
}

export interface CommitEvent {
  hash: string;        // Non-empty git SHA (7-40 hex chars)
  parents: string[];   // Parent commit hashes
  t: number;           // Unix timestamp in seconds (integer >= 0)
  author: string;      // Key referencing History.authors
  message: string;     // First line of commit message (single line)
  isBot: boolean;
  changes: FileChange[];
}

export interface AuthorInfo {
  name: string;
  email?: string;
  isBot: boolean;
}

export interface TagInfo {
  name: string;
  hash: string;
  t: number;
}

export interface RepoMetadata {
  name: string;
  head: string;
  defaultBranch?: string;
}

export interface History {
  schemaVersion: 1;
  repo: RepoMetadata;
  authors: Record<string, AuthorInfo>;
  tags: TagInfo[];
  events: CommitEvent[];
}
```
Additional shared core types:
- `HighlightType`: `'largest_commit' | 'new_top_dir' | 'contributor_surge' | 'release_tag' | 'mass_refactor'`
- `Highlight`: `{ id: string; type: HighlightType; eventIndex: number; hash: string; t: number; score: number; title: string; detail: string }`
- `Chapter`: `{ name: string; hash: string; eventIndex: number; t: number }`
- `NarrationProvider` interface for `FR-28` (opt-in, disabled by default).

## 4. Behavior & Validation Rules
- `validateHistory(input: unknown)` returns `{ ok: true; data: History } | { ok: false; errors: ValidationError[] }`.
- Rejects non-object inputs, missing/unsupported `schemaVersion !== 1`, missing `repo.name` or `repo.head`, negative `add`/`del`, invalid `FileChangeType`, missing `from` when `type` is `'R'` or `'C'`, non-integer timestamps, or `event.author` not present in `authors` (or reports clear path-qualified error messages).
- `normalizeRepoPath(raw: string)` converts `\` to `/`, strips leading `./` and `/`, collapses duplicate slashes, and rejects path traversal (`..` segments).
- `escapeText(raw: string)` strips dangerous ASCII control characters (except space/tab) and HTML-escapes `< > & " '` for safe rendering.
- `HISTORY_JSON_SCHEMA_V1` exports a valid JSON Schema Draft 2020-12 object matching the TypeScript types.

## 5. Edge Cases & Error Handling
- Empty repository (`events: []`, `tags: []`, `authors: {}`, `repo.head: ""`) MUST be valid.
- Single-commit repository with 0 file changes (empty commit) MUST be valid.
- Filenames with spaces, quotes, Unicode (CJK, emoji), and deep nesting MUST validate cleanly.
- Huge numbers of events must validate iteratively without stack overflow.
