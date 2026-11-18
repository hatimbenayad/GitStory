# Tasks: U1 — Core Types & `history.json` Schema

- [x] T1.1 Create root monorepo config (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `vitest.config.ts`)
- [x] T1.2 Initialize `packages/core/package.json` and `packages/core/tsconfig.json`
- [x] T1.3 [P] Write failing unit tests for `validateHistory`, `normalizeRepoPath`, `escapeHtml`, and `HISTORY_JSON_SCHEMA_V1` (`packages/core/test/validate.test.ts`, `packages/core/test/sanitize.test.ts`)
- [x] T1.4 Implement `packages/core/src/types.ts` and `packages/core/src/schema.ts`
- [x] T1.5 Implement `packages/core/src/sanitize.ts` and `packages/core/src/validate.ts`
- [x] T1.6 Wire `packages/core/src/index.ts`, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- [x] T1.7 Update `docs/progress.md` and commit Bolt U1
