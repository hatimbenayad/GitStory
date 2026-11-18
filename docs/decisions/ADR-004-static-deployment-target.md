# ADR-004: Static Web App Deployment Target

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** Section 3.3 Operations, Unit `U15`

## Context
Section 3.3 requires choosing and documenting a static web app deployment configuration (GitHub Pages, Vercel, or Netlify).

## Decision
Configure **GitHub Pages** as the primary zero-config deployment target via `.github/workflows/deploy.yml` (building `apps/web` with relative/configurable `VITE_BASE_PATH` and deploying via `actions/deploy-pages`), and additionally include a minimal `vercel.json` for one-click Vercel preview/production deploys.

## Consequences
- Works automatically on the GitHub repository with zero third-party tokens required.
- Relative asset paths ensure the static bundle also works seamlessly when served by `apps/cli` (`gitstory serve`).
