# GitStory Constitution

This document defines the non-negotiable engineering, privacy, quality, and process principles governing the GitStory project. Every specification, architectural decision, pull request, and commit must uphold these principles.

## 1. Type Safety and Code Quality
- **TypeScript Strict Mode Everywhere:** All packages and apps (`packages/*`, `apps/*`) must compile with `"strict": true`, `"noUncheckedIndexedAccess": true`, and zero `any` escapes in public APIs.
- **Small, Cohesive Modules:** Prefer focused modules with explicit public APIs documented via TSDoc.
- **Automated Quality Gates:** ESLint, Prettier, `tsc --noEmit`, unit tests, and build must pass before any unit is marked complete and on every CI run.

## 2. Local-First and Privacy
- **Zero Default Uploads:** Local repositories are analyzed locally and never uploaded anywhere.
- **Opt-In Network Features:** Any feature that performs network requests (such as cloning a public GitHub URL via the optional backend or optional narration providers) must be explicitly user-initiated, clearly labeled, and never required for local workflows.
- **No Accounts or Telemetry:** No user accounts, authentication walls, analytics trackers, or telemetry.

## 3. Security and Untrusted Input
- **Untrusted Repo Content:** All data originating from Git repositories (file paths, commit messages, author names, emails, tag names, source code) must be treated as untrusted.
- **Safe Rendering:** Always escape rendered text; never use `eval`, `new Function`, or unsanitized `dangerouslySetInnerHTML`.
- **Safe Subprocess Execution:** Always pass arguments as arrays (`spawn(cmd, args)`), never interpolate untrusted paths or refs into shell strings.
- **Zero Secrets in Git:** Never commit API keys, tokens, credentials, or `.env` files. Never print credentials in logs.

## 4. Spec-Driven, Test-First Development (AI-DLC + SDD)
- **Specs Before Code:** No implementation code is written for a unit until its `spec.md`, `plan.md`, and `tasks.md` exist, are mutually consistent, and are committed.
- **Tests First for Core Engine:** For every Bolt in the core packages (`core`, `extractor`, `layout`, `timeline`, `exporter`), write failing tests derived from acceptance criteria before implementing production code.
- **Specs Never Drift:** If implementation uncovers a necessary change in contract or behavior, update the corresponding spec (and record an ADR if architectural) in the same commit.
- **Record Decisions:** Ambiguities resolved during design or implementation are captured in short ADRs under `docs/decisions/`.

## 5. Performance and Memory Budgets
- **Streaming Extraction:** Never buffer an entire `git log` output into a single string; parse incrementally via streams so memory remains bounded on large repositories.
- **Non-Blocking UI:** Parsing, modeling, and layout computations run off the main thread via Web Workers whenever possible so the UI remains responsive.
- **Target Budgets:**
  - Replay frame rate: 60 fps target for up to 20,000 visible nodes on a mid-range laptop.
  - Time to first frame: ≤ 3 seconds for a 5,000-commit repository from cached data.
  - Local extraction speed: ≤ 30 seconds for a 10,000-commit repository.
- **Graceful Scaling:** Automatically activate large-repo strategies (time aggregation, directory collapsing, configurable node cap) when thresholds are exceeded.

## 6. Accessibility and Robustness
- **Accessibility Baseline:**
  - All playback and navigation controls must be fully keyboard-operable with visible focus states and ARIA labels.
  - Sufficient color contrast (WCAG AA minimum for UI controls and overlays).
  - Respect `prefers-reduced-motion` and provide an explicit Reduced Motion toggle.
  - Provide a colorblind-safe (Okabe–Ito / Paul Tol) author/extension palette option.
- **Edge-Case Robustness:** Gracefully handle empty repositories, single-commit repositories, shallow clones, detached HEAD, binary files, huge commits, unusual filenames (spaces, Unicode, quotes, control chars), and repositories without tags.
- **Progressive Enhancement:** Features relying on modern browser APIs (File System Access API, WebCodecs) must detect capability and provide clear fallbacks.

## 7. Git Hygiene and Scope Discipline
- **Conventional Commits:** Every commit uses Conventional Commits referencing the relevant unit/scope (e.g., `feat(core): add history schema validation`).
- **Strict Unit Order:** Build MVP units first (U1–U6), followed by storytelling, visualization, performance, export, optional backend, v2 architecture comparison, and operations. Do not invent features outside the PRD without an ADR.
