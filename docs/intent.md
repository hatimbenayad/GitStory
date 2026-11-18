# GitStory Intent

## 1. Business Goal
**GitStory turns a Git repository into a documentary.**

> "Paste a repo, press play, watch how a project was built."

Software repositories contain rich stories of architecture emerging, teams collaborating, refactors unfolding, and releases shipping—yet standard `git log` output is flat and opaque. GitStory transforms any Git repository's history into an interactive, watchable, exportable visual documentary without requiring accounts, cloud lock-in, or uploading private code.

## 2. Core Objectives
1. **Chronological Animated Replay:** Replay commits as an animated, spatially stable file tree where files appear on creation, flash on modification, move smoothly on rename, and fade out on deletion.
2. **Documentary Storytelling:** Elevate playback beyond raw commit replay using adaptive pacing (skipping quiet intervals, pausing/slowing on key moments), tag-based chapters, and automated highlight detection.
3. **Multiple Perspectives:** Offer complementary views over the exact same history dataset:
   - Radial / force file-tree replay (primary documentary view)
   - Animated treemap (codebase size & composition over time)
   - Contributor activity & streamgraph view (team growth and ownership dynamics)
   - Architecture comparison diff (v2: comparing module dependency graphs between two refs using tree-sitter)
4. **Local-First Ingestion:** Provide a fast CLI (`gitstory`) running real `git` locally to generate a versioned `history.json` or launch the local web app preloaded, alongside browser drag-and-drop, File System Access API local folder ingestion, and an optional self-hostable backend for public GitHub URLs.
5. **Shareable Output:** Export smooth, customizable MP4 and GIF clips directly from the browser for READMEs, talks, retrospectives, and social posts.

## 3. Target Audience
- **Open-source & product developers** showcasing how their project was built.
- **Maintainers** onboarding new contributors to a codebase's structure and history.
- **Engineering teams** running project retrospectives.
- **Educators** demonstrating real-world software evolution.

## 4. Non-Goals (v1)
- Hosted user accounts, logins, or payment systems.
- Write access or repository mutations of any kind.
- Non-Git version control systems.
- Browser extensions or native desktop wrappers (potential v2 wrappers).
- Real-time live repository tracking (point-in-time snapshot analysis only).

## 5. Measurable Success Criteria (Definition of Done)
| # | Criterion | Verification Method |
|---|---|---|
| SC-1 | `npx gitstory <path>` (or local CLI invocation) produces a schema-valid `history.json` for any real Git repository | Automated CLI integration tests + manual run on GitStory repo |
| SC-2 | The web app loads `history.json` and plays a smooth animated replay with working playback controls, overlays, keyboard shortcuts, and tag chapters | Playwright E2E smoke test + unit tests |
| SC-3 | Treemap view and Contributor view (with streamgraph) render and scrub cleanly over the same `history.json` | Unit tests + Playwright E2E view-switching test |
| SC-4 | A repository of 5,000+ commits remains responsive and usable with large-repo strategy active (sampling/aggregation, directory collapsing, node cap) | Synthetic benchmark script recorded in `docs/progress.md` |
| SC-5 | MP4 (and GIF) export produces a valid, playable video/animation file with progress and cancel support | Exporter unit tests + Playwright E2E clip export smoke test |
| SC-6 | GitHub Actions CI passes green on `main` (install, lint, typecheck, unit tests, build) | `.github/workflows/ci.yml` execution |
| SC-7 | `README.md` enables a new developer to install, run, and visualize a repo in under 5 minutes | Fresh-start walkthrough verification |
| SC-8 | A demo GIF/MP4 of GitStory visualizing its own repository history is committed at `docs/demo/` | File present and verified in `docs/demo/` |
| SC-9 | All SDD specifications (`specs/*`), ADRs (`docs/decisions/*`), and progress logs (`docs/progress.md`) are in sync with the implemented code | Spec/code audit before final push |
