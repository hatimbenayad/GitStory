# Plan: U15 — Operations: CI, Deploy, Docs & Self-History Demo

## 1. Technical Approach
- Create `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` using `pnpm/action-setup` and `actions/setup-node` (Node 22).
- Write `vercel.json` pointing to `apps/web/dist`.
- Write concise, practical `README.md`, `CONTRIBUTING.md`, and `docs/runbook.md`.
- Write a self-demo generator script (`scripts/generate-demo.mjs`) that runs our own `@gitstory/extractor` on the GitStory repo itself, steps `@gitstory/core` (`ReplayEngine`, `detectHighlights`, `buildChapters`), `@gitstory/timeline`, `@gitstory/layout`, and renders real frames into `@gitstory/exporter` (GIF89a) saved at `docs/demo/gitstory-demo.gif`.
- Audit all `specs/u1..u15` tasks, run full `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + Playwright E2E, commit, and push to `origin main`.
