# Contributing to GitStory

GitStory is built using **AI-DLC (AI-Driven Development Life Cycle)** paired with **SDD (Spec-Driven Development)**.

## Core Rules (from `docs/constitution.md`)
1. **Specs before code:** Every feature or unit change must keep its `specs/<unit-id>/spec.md`, `plan.md`, and `tasks.md` in sync in the same commit.
2. **Record decisions:** Architectural tradeoffs belong in short ADRs under `docs/decisions/ADR-NNN-*.md`.
3. **Strict TypeScript everywhere:** Zero `any` escapes in public APIs; `pnpm typecheck` and `pnpm lint` must pass cleanly.
4. **Tests first for core packages:** Write unit tests derived from acceptance criteria before implementing engine changes.
5. **Local-first & untrusted input safety:** Never upload local repo data by default; always escape repository strings; never interpolate user input into shell commands.
6. **No secrets in git:** Never commit `.env` files, tokens, or API keys.

## Development Workflow
```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Commit Style
Use **Conventional Commits** referencing the scope/unit:
- `feat(extractor): parse copy entries from git log`
- `fix(timeline): clamp seek time on single-commit repos`
- `docs(specs): update U5 layout stability invariant`
