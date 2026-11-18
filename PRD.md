# GitStory: Product Requirements Document

> **Audience:** an autonomous AI coding agent.
> **Method:** AI-DLC (AI-Driven Development Life Cycle) combined with SDD (Spec-Driven Development).
> **Repository:** https://github.com/hatimbenayad/GitStory.git

---

## 0. Instructions to the agent (read first)

You are building **GitStory** end to end. Follow this document as the source of truth.

1. Read this entire PRD before writing any code.
2. Work in the order defined in **Section 3 (Process)**. Do not skip the spec phases. No implementation code is written until its spec exists and is committed.
3. When something is ambiguous, pick the simplest reasonable option, record the decision in `docs/decisions/` (one short ADR per decision), and continue. Only stop to ask the human if a decision is irreversible or blocks all progress.
4. Commit small and often. Everything must end up in the GitHub repository (see **Section 12 (Delivery)**).
5. Never commit secrets, tokens, or credentials. Never print them in logs.

---

## 1. Product overview

**GitStory turns a Git repository into a documentary.** It replays a project's history as an animated, watchable story: files appearing and changing, contributors arriving, architecture evolving, releases acting as chapters.

**One-line pitch:** "Paste a repo, press play, watch how a project was built."

### 1.1 Goals
- Replay commits chronologically as an animated file tree.
- Show files being created, modified, renamed, and deleted.
- Visualize contributor activity.
- Compare architecture between two points in time (tags or commits).
- Export the animation as MP4/GIF.
- Make the result feel like a *documentary* (pacing, chapters, highlights), not a raw log playback.

### 1.2 Non-goals (v1)
- No hosted user accounts or authentication.
- No editing of repositories, and no write access to any repo being analyzed.
- No support for non-Git VCS.
- No browser extension and no desktop app (possible future wrappers).
- No real-time tracking of repos; analysis is a point-in-time snapshot.

### 1.3 Target users
- Developers who want to share the story of their project (READMEs, talks, social posts).
- Maintainers onboarding contributors.
- Teams doing retrospectives.
- Educators showing how real software evolves.

---

## 2. Platform decision

**Primary: web app, local-first. Secondary: small CLI.**

| Surface | Decision | Reason |
|---|---|---|
| Web app | **Build (v1)** | Zero install, shareable, strong canvas/WebGL animation support |
| CLI (`gitstory`) | **Build (v1, thin)** | Runs real `git` locally, handles private and huge repos without uploading anything |
| Browser extension | Out of scope (v2 idea: "Watch the story" button on GitHub that links to the web app) | Poor fit for heavy rendering |
| Desktop app | Out of scope (v2 idea: Tauri wrapper) | Web app and CLI already cover the need |

---

## 3. Process: AI-DLC + SDD

The agent must run the project in the three AI-DLC phases, producing SDD artifacts at each step. All artifacts live in the repo and are committed.

### 3.1 Inception phase (spec before code)

Produce, in this order, committing after each:

1. **`docs/constitution.md`**: project principles and non-negotiables (TypeScript strict mode, local-first and privacy, test-first for the core engine, performance budgets from Section 9, accessibility baseline, no secrets in git).
2. **`docs/intent.md`**: the Intent (the business goal) restated from Section 1, with measurable success criteria from Section 10.
3. **`docs/user-stories.md`**: user stories with acceptance criteria in Given/When/Then form, derived from Section 5.
4. **`docs/units.md`**: decompose the Intent into **Units** (cohesive, independently deliverable pieces of work). Use the suggested units in Section 6, refine as needed. For each unit: purpose, inputs, outputs, dependencies, definition of done.
5. **`specs/<unit-id>/spec.md`**: one SDD spec per unit describing *what* and *why* (behavior, data contracts, edge cases, error handling). Mark unclear points as `[NEEDS CLARIFICATION]` and resolve them via ADRs.
6. **`specs/<unit-id>/plan.md`**: *how*: technical approach, data models, module boundaries, libraries, risks.
7. **`specs/<unit-id>/tasks.md`**: an ordered, checkable task list (small, testable tasks; mark which can run in parallel).

**Gate:** do not start Construction for a unit until its `spec.md`, `plan.md`, and `tasks.md` are committed and mutually consistent.

### 3.2 Construction phase (build in Bolts)

- Work in **Bolts**: short, focused iterations, each delivering one unit or a meaningful slice of one.
- For each Bolt:
  1. **Domain design:** types and data models from the spec.
  2. **Logical design:** modules, interfaces, and public APIs.
  3. **Tests first:** write failing tests derived from the acceptance criteria.
  4. **Implement** until tests pass.
  5. **Verify:** run lint, typecheck, unit tests, and (when UI exists) a smoke test of the real UI.
  6. **Update the spec** if reality diverged (specs and code must never drift; the spec is updated in the same commit as the change).
  7. **Commit** with a Conventional Commit message referencing the unit (e.g. `feat(extractor): parse rename entries from git log`).
- Maintain `docs/progress.md`: one line per Bolt (unit, status, date, notes).

### 3.3 Operations phase (ship and run)

- Add CI (GitHub Actions): install, lint, typecheck, test, build on every push and PR.
- Add a deploy configuration for the static web app (GitHub Pages or Vercel/Netlify config; pick one and document it).
- Publish-ready CLI packaging (`package.json` bin entry, README usage), without publishing to npm unless the human asks.
- Write `README.md`, `CONTRIBUTING.md`, and a `docs/runbook.md` (how to run, build, debug, and add a new visualization).
- Produce a demo: run GitStory on this repository itself and store a short GIF/MP4 at `docs/demo/`.

---

## 4. Tech stack (fixed unless an ADR justifies a change)

- **Language:** TypeScript (strict) everywhere
- **Monorepo:** pnpm workspaces
- **Web app:** React + Vite
- **Rendering:** PixiJS (WebGL) for the main replay; D3 modules (`d3-hierarchy`, `d3-force`, `d3-treemap`, `d3-scale`) for layout math only; Canvas2D acceptable for simple views
- **Animation/timeline:** custom virtual-clock timeline engine (no heavy framework)
- **State:** Zustand
- **Git access:**
  - CLI: real `git` via Node `child_process` (streamed)
  - Browser: `isomorphic-git` only as an optional path; local folders via File System Access API (progressive enhancement)
- **Code parsing (v2 architecture diff):** tree-sitter compiled to WASM
- **Storage/cache:** IndexedDB (via `idb`)
- **Concurrency:** Web Workers for parsing, modeling, and layout; the UI thread must never block
- **Export:** WebCodecs + `mp4-muxer`; `ffmpeg.wasm` as fallback; GIF via a lightweight encoder
- **Testing:** Vitest (unit), Playwright (E2E smoke), fixture repos generated programmatically in test setup
- **Quality:** ESLint, Prettier, `tsc --noEmit` in CI
- **Optional thin backend:** Node + Hono, only for cloning public GitHub URLs and caching results. Must remain optional; the app must work fully without it for local repos.

### 4.1 Suggested repository layout

```
GitStory/
├─ PRD.md
├─ README.md
├─ docs/            (constitution, intent, user-stories, units, decisions/, progress, runbook, demo/)
├─ specs/           (one folder per unit: spec.md, plan.md, tasks.md)
├─ packages/
│  ├─ core/         (types, event model, state replay, keyframes, highlight detection)
│  ├─ extractor/    (git log parsing, mailmap, bot detection, streaming)
│  ├─ layout/       (tree, treemap, contributor, architecture layouts)
│  ├─ timeline/     (virtual clock, adaptive pacing, scrubbing)
│  └─ exporter/     (video/GIF export)
├─ apps/
│  ├─ web/          (React + Vite + PixiJS UI)
│  ├─ cli/          (npx gitstory)
│  └─ server/       (optional thin clone/cache service)
└─ .github/workflows/
```

---

## 5. Functional requirements

IDs are stable; reference them in specs, tests, and commits.

### 5.1 Ingestion
- **FR-1:** CLI accepts a local repo path and outputs `history.json` (documented schema, versioned).
- **FR-2:** CLI can start the web app on localhost with the repo preloaded.
- **FR-3:** Web app accepts a `history.json` file via drag-and-drop.
- **FR-4:** Web app accepts a local folder (File System Access API) where supported, with a clear fallback message elsewhere.
- **FR-5 (v1):** Web app accepts a public GitHub URL via the optional backend (partial clone `--filter=blob:none --no-checkout`).

### 5.2 Extraction
- **FR-6:** Extract per commit: hash, parents, author name/email, timestamp, message, and per-file status (A/M/D/R/C), lines added and removed. Use a single streaming `git log --reverse --date-order -M -C --name-status --numstat` style command with a robust delimiter-safe format.
- **FR-7:** Apply `.mailmap` to merge author identities.
- **FR-8:** Detect bots (e.g. dependabot, renovate, github-actions) and mark them so they can be dimmed or hidden.
- **FR-9:** Extract tags and treat them as chapter markers.
- **FR-10:** Support first-parent-only (default) and full-history modes.
- **FR-11:** Handle renames so files do not appear to die and be reborn.
- **FR-12:** Stream-parse so memory stays bounded on very large repos.

### 5.3 Modeling
- **FR-13:** Build an evolving file-tree state by replaying events; precompute keyframes every N events for instant scrubbing.
- **FR-14:** Cache processed results in IndexedDB keyed by repo identity + HEAD + options.
- **FR-15:** Detect highlights: largest commits, first appearance of a top-level directory, contributor surges, tag/release moments, mass deletions/refactors.

### 5.4 Visualization and playback
- **FR-16:** Replay view: animated radial/force tree (directories as branches, files as leaves) with files appearing, flashing on modification, fading on deletion, moving on rename.
- **FR-17:** Treemap view with animated transitions showing size over time.
- **FR-18:** Contributor view: avatars/markers moving to files they touch, plus a streamgraph of activity per contributor.
- **FR-19:** Overlay: current date, commit message, author, running stats (files, lines, contributors).
- **FR-20:** Timeline controls: play/pause, speed, scrubber, jump to chapter (tag), keyboard shortcuts.
- **FR-21:** Adaptive pacing: skip dead periods, slow down on highlights; user can switch to constant speed.
- **FR-22:** Layout stability: node positions must stay stable between frames (no jumping).
- **FR-23:** Large-repo handling: sampling/aggregation of commits into "days" or "weeks", collapsing deep directories, configurable node cap.

### 5.5 Architecture comparison (v2 within this project, build after v1 is done)
- **FR-24:** Choose two refs (tags/commits); compute module/dependency graphs via tree-sitter for supported languages (start with TypeScript/JavaScript, Python).
- **FR-25:** Show side-by-side or diff overlay: added (green), removed (red), changed (amber).

### 5.6 Export and sharing
- **FR-26:** Export MP4 (and GIF) at selectable resolution/duration; progress indicator; cancelable.
- **FR-27:** Shareable link for a processed public repo when the backend is enabled; static permalink options otherwise.

### 5.7 Optional narration (stretch)
- **FR-28:** Generate narration text from highlights and release notes through a pluggable provider interface. No API keys in the repo; disabled by default.

---

## 6. Suggested units (refine in `docs/units.md`)

| ID | Unit | Depends on |
|---|---|---|
| U1 | Core types and `history.json` schema | none |
| U2 | Git extractor + CLI `history.json` output | U1 |
| U3 | State replay engine + keyframes | U1 |
| U4 | Timeline engine (virtual clock, pacing, scrubbing) | U3 |
| U5 | Replay renderer (PixiJS tree view) | U3, U4 |
| U6 | Web app shell, file loading, overlays, controls | U5 |
| U7 | Highlight detection + chapters | U2, U3 |
| U8 | Treemap view | U3 |
| U9 | Contributor view + streamgraph | U3 |
| U10 | IndexedDB caching + Web Worker offloading | U2, U3 |
| U11 | Large-repo strategy (sampling, aggregation, caps) | U7, U10 |
| U12 | Exporter (MP4/GIF) | U5 |
| U13 | Optional backend (GitHub URL, cache, share links) | U2 |
| U14 | Architecture comparison (tree-sitter) | U2, U3 |
| U15 | CI, deploy, docs, demo | all |

Recommended delivery order: **U1 → U2 → U3 → U4 → U5 → U6** form the MVP. Then U7 → U10 → U8 → U9 → U11 → U12 → U13 → U14 → U15.

---

## 7. Data contract (starting point)

`history.json` must include a `schemaVersion`, repo metadata, authors, tags, and an ordered list of events:

```ts
type FileChange = {
  path: string;
  type: 'A' | 'M' | 'D' | 'R' | 'C';
  from?: string;      // for renames/copies
  add: number;
  del: number;
};

type CommitEvent = {
  hash: string;
  parents: string[];
  t: number;          // unix seconds
  author: string;     // canonical id after mailmap
  message: string;    // first line
  isBot: boolean;
  changes: FileChange[];
};

type History = {
  schemaVersion: 1;
  repo: { name: string; head: string; defaultBranch?: string };
  authors: Record<string, { name: string; email?: string; isBot: boolean }>;
  tags: { name: string; hash: string; t: number }[];
  events: CommitEvent[];
};
```

Finalize and version this in U1 with a JSON Schema and validation.

---

## 8. Non-functional requirements

- **Performance:** 60 fps target in replay for up to 20k visible nodes on a mid-range laptop; first frame within 3 s for a 5k-commit repo from cached data; extraction of a 10k-commit repo under 30 s locally.
- **Memory:** stream parsing; never load the entire raw `git log` output into one string.
- **Privacy:** local-first. Local repos are never uploaded. Any network feature is opt-in and clearly labeled.
- **Accessibility:** keyboard-operable controls, sufficient contrast, reduced-motion mode, colorblind-safe author palette option.
- **Compatibility:** latest Chrome, Edge, Firefox, and Safari for playback; File System Access features degrade gracefully.
- **Robustness:** handle empty repos, single-commit repos, shallow clones, detached HEAD, binary files, huge commits, weird filenames (spaces, unicode, quotes), and repos with no tags.
- **Security:** treat all repository content (paths, messages, author names) as untrusted. Escape all rendered text. No `eval`, no unsanitized HTML.
- **Maintainability:** strict types, small modules, public APIs documented via TSDoc.

---

## 9. Testing strategy

- **Unit tests** for the extractor parser (including nasty inputs), replay engine, pacing, highlight detection, layout stability.
- **Fixture repos** generated programmatically in test setup (renames, merges, deletions, bots, duplicate authors), never large binary fixtures committed.
- **Property-style tests** for the replay engine: replaying then scrubbing to any index equals replaying from scratch to that index.
- **E2E smoke (Playwright):** load a fixture `history.json`, play, scrub, switch views, export a short clip.
- **Performance checks:** a benchmark script on a synthetic large history; record results in `docs/progress.md`.
- Every `FR-*` must map to at least one test or a documented manual verification step in its spec.

---

## 10. Success criteria (Definition of Done for the Intent)

1. `npx gitstory <path>` (or the local equivalent) produces a valid `history.json` for a real repository.
2. The web app loads that file and plays a smooth animated replay with working controls, overlays, and chapters.
3. Treemap and contributor views work on the same data.
4. A repo of 5k+ commits remains usable (large-repo strategy active, UI responsive).
5. MP4 export produces a playable file.
6. CI is green on the main branch: lint, typecheck, tests, build.
7. README lets a new developer run everything in under 5 minutes.
8. A demo GIF/MP4 of GitStory visualizing its own history is in `docs/demo/`.
9. All specs are in sync with the code.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Huge repos overwhelm the browser | Streaming extraction, sampling/aggregation, node caps, workers |
| Animation looks chaotic | Stable layouts, adaptive pacing, highlight-driven storytelling |
| Rename/merge noise distorts history | `-M -C`, first-parent default, mailmap, bot filtering |
| Browser API gaps (File System Access, WebCodecs) | Progressive enhancement with fallbacks (drop-in `history.json`, ffmpeg.wasm) |
| Scope creep | Strict unit order; architecture diff and narration only after MVP is done |

---

## 12. Delivery: push everything to GitHub

When the work is ready (and at every meaningful milestone), publish to:

**https://github.com/hatimbenayad/GitStory.git**

Steps:

1. Initialize git if needed: `git init`, set the default branch to `main`.
2. Add the remote:
   `git remote add origin https://github.com/hatimbenayad/GitStory.git`
   (if `origin` exists, verify it points to this URL).
3. Add a proper `.gitignore` (node_modules, dist, build output, `.env*`, coverage, OS files) **before** the first commit.
4. Use Conventional Commits and commit per Bolt. Keep this `PRD.md`, all `docs/`, and all `specs/` in the repository.
5. Push: `git push -u origin main`. Push again after each completed unit.
6. If the push fails because of authentication or permissions, **stop and report the exact error to the human** and ask them to provide access (for example a configured credential helper or GitHub CLI login). **Never** hardcode, print, or commit tokens. Do not force-push or rewrite history unless the human explicitly asks.
7. At the end, verify the remote contains: source, specs, docs, CI workflow, README, and the demo. Report the commit hash of the final push and a short summary of what was delivered, what was deferred, and any open ADRs.

---

## 13. Out-of-scope reminders for the agent

Do not add accounts, payments, analytics trackers, or telemetry. Do not upload local repository data anywhere by default. Do not publish to npm. Do not invent features beyond this PRD without recording an ADR first.
