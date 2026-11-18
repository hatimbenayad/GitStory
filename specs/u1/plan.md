# Plan: U1 — Core Types & `history.json` Schema

## 1. Technical Approach
- Bootstrap the pnpm monorepo workspace (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, ESLint v9 flat config, Prettier config, Vitest workspace config).
- Create `packages/core` as a dual-friendly ESM TypeScript package (`"type": "module"`, strict `tsconfig.json`, `tsc` build emitting `.js` + `.d.ts`).
- Implement zero-dependency deterministic runtime validator alongside the exported JSON Schema v1 object so browser workers, CLI, and server incur minimal bundle size and fast validation on 50k+ events.

## 2. Module Boundaries (`packages/core/src/`)
- `types.ts`: All canonical data contracts (`History`, `CommitEvent`, `FileChange`, `AuthorInfo`, `TagInfo`, `Highlight`, `Chapter`, `NarrationProvider`, `ValidationError`).
- `schema.ts`: `HISTORY_JSON_SCHEMA_V1` (JSON Schema Draft 2020-12).
- `validate.ts`: `validateHistory(input: unknown)` and `assertValidHistory(input: unknown)`.
- `sanitize.ts`: `normalizeRepoPath`, `getParentDir`, `getTopLevelDir`, `getFileExtension`, `escapeHtml`, `stripControlChars`.
- `index.ts`: Barrel exporting all public types and functions with TSDoc comments.

## 3. Risks & Mitigations
- **Drift between JSON Schema and TS types:** Unit tests validate both the schema structure and runtime validator against identical fixtures.
- **Validation speed on large files:** Iterative `for` loops (no recursive deep-cloning during validation) keep validation of 20k commits under ~50ms.
