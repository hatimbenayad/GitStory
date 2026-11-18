# GitStory User Stories

All acceptance criteria are written in **Given / When / Then** format and traced directly to the Functional Requirements (`FR-1` through `FR-28`) in `PRD.md`.

---

## Epic 1: Ingestion (`FR-1` – `FR-5`)

### US-1.1: Export repository history via CLI (`FR-1`)
As a developer, I want to run `gitstory <path>` against a local Git repository so that I get a versioned, portable `history.json` file without uploading my code.
- **Given** a valid local Git repository at `<path>`
- **When** I run `gitstory <path> -o history.json` (or `gitstory extract <path>`)
- **Then** the CLI writes a JSON file matching `History` schema v1 containing repo metadata, authors, tags, and chronological commit events
- **And** exits with code `0`.

### US-1.2: Launch preloaded web app from CLI (`FR-2`)
As a developer, I want the CLI to serve the web app on localhost preloaded with my repository so that I can immediately watch its story.
- **Given** a valid local Git repository at `<path>`
- **When** I run `gitstory <path> --serve` (or `gitstory serve <path>`)
- **Then** the CLI extracts the history, starts a local HTTP server serving the web app and `/api/history.json`
- **And** prints the `http://localhost:<port>` URL with the repo preloaded automatically on open.

### US-1.3: Load `history.json` via drag-and-drop (`FR-3`)
As a web user, I want to drag and drop (or pick) a `history.json` file into the GitStory web app so that I can replay it completely offline.
- **Given** the GitStory web app is open
- **When** I drop a valid `history.json` file onto the drop zone (or select it via file input)
- **Then** the file is validated against schema v1, loaded into the replay engine, and playback begins ready at the first frame
- **And** if the file is malformed or has an unsupported schema version, a clear, actionable error banner is shown without crashing.

### US-1.4: Load a local folder via File System Access API (`FR-4`)
As a browser user on Chromium, I want to select a local repository folder directly from the browser so that I can inspect small local repos without running the CLI.
- **Given** a browser supporting `window.showDirectoryPicker`
- **When** I click "Open Local Folder" and choose a Git repository folder containing `.git`
- **Then** the app reads the repository metadata/commits locally via `isomorphic-git` over the directory handle and loads the replay
- **And** in browsers that do not support File System Access API, the button displays a clear fallback message instructing the user to use `npx gitstory` and drop `history.json`.

### US-1.5: Load a public GitHub URL via optional backend (`FR-5`)
As a user, I want to paste a public GitHub repository URL into the web app when an optional backend is configured so that I can watch any public open-source project.
- **Given** the optional GitStory server is running and configured in the web app
- **When** I paste `https://github.com/owner/repo` and submit
- **Then** the backend performs a read-only blobless clone (`--filter=blob:none --no-checkout`), extracts `history.json`, caches it, and returns it to the web app
- **And** when the backend is not configured or unreachable, the UI clearly marks the GitHub URL tab as requiring the optional backend while keeping all local features fully functional.

---

## Epic 2: Extraction (`FR-6` – `FR-12`)

### US-2.1: Stream-parse commit metadata and file stats (`FR-6`, `FR-12`)
As a maintainer of a large repository, I want `git log` parsed incrementally as a stream so that extraction stays fast and bounded in memory even on 10k+ commits.
- **Given** a repository with commits containing additions, modifications, deletions, renames, copies, binary files, spaces, quotes, and Unicode filenames
- **When** the extractor runs `git log` using delimiter-safe markers and streams stdout line-by-line
- **Then** every commit event includes `hash`, `parents`, `t`, `author`, `message` (first line), `isBot`, and `changes` (`path`, `type`, `from`, `add`, `del`)
- **And** stdout is never concatenated into one full-file string in memory.

### US-2.2: Normalize author identities with `.mailmap` (`FR-7`)
As a team lead, I want duplicate author identities merged via `.mailmap` so contributor statistics and colors stay accurate.
- **Given** a repository with a `.mailmap` mapping two emails/names to one canonical identity
- **When** extraction runs
- **Then** commits from both aliases resolve to the single canonical author ID in `authors` and `events`.

### US-2.3: Identify and flag bot commits (`FR-8`)
As a viewer, I want automated bot commits flagged so I can dim or hide noisy dependency bumps during playback.
- **Given** commits authored by bots (e.g., `dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`, or `[bot]` suffix)
- **When** extraction runs
- **Then** those authors and events have `isBot: true`, while human commits have `isBot: false`.

### US-2.4: Extract tags as chapters (`FR-9`)
As a viewer, I want Git tags extracted with their commit hashes and timestamps so releases appear as chapters on the timeline.
- **Given** a repository with lightweight and annotated tags
- **When** extraction runs
- **Then** `history.tags` contains sorted tag entries `{ name, hash, t }` resolved to their target commit hash.

### US-2.5: First-parent vs. full-history mode (`FR-10`)
As a user, I want first-parent history by default (for clean mainline storytelling) with an option for full history when inspecting branches.
- **Given** a repository with merged feature branches
- **When** extraction runs with default options (`firstParent: true`)
- **Then** only the mainline first-parent commit sequence is emitted
- **And** when `firstParent: false`, all commits in chronological `--date-order` are included.

### US-2.6: Preserve file identity across renames (`FR-11`)
As a viewer, I want renamed files tracked as renames (`type: 'R'` with `from`) rather than delete+add so files glide smoothly instead of dying and respawning.
- **Given** a commit that renames `src/old.ts` to `src/new.ts`
- **When** extraction runs with `-M -C`
- **Then** the emitted change has `type: 'R'`, `from: 'src/old.ts'`, `path: 'src/new.ts'`.

---

## Epic 3: Modeling (`FR-13` – `FR-15`)

### US-3.1: Replay file tree and instant scrubbing via keyframes (`FR-13`)
As a viewer, I want to scrub anywhere on the timeline instantaneously and always see the exact file tree for that commit.
- **Given** a loaded `History` of `M` events
- **When** the replay engine builds keyframes every `N` events and I scrub to any commit index `k`
- **Then** the resulting file tree state (paths, sizes, directories, active authors, totals) is byte-for-byte equivalent to replaying from commit `0` to `k`.

### US-3.2: Persist processed history in IndexedDB (`FR-14`)
As a returning user, I want processed repository models cached locally in IndexedDB so reloading the same repo renders the first frame within 3 seconds.
- **Given** a repository already loaded with `(repoName, head, options)`
- **When** I reopen the same repository in the browser
- **Then** the cached parsed data / model is retrieved from IndexedDB without recomputing from scratch.

### US-3.3: Automatic documentary highlight detection (`FR-15`)
As a viewer, I want GitStory to automatically detect milestone commits (big commits, new top-level directories, contributor surges, tags, mass refactors/deletions) so the playback feels like a curated documentary.
- **Given** a `History` with tags, top-level directory additions, large commits, and contributor activity
- **When** the highlight detector analyzes the history
- **Then** it outputs a ranked list of typed `Highlight` records linked to event indices and `Chapter` markers for tags.

---

## Epic 4: Visualization, Playback & Scaling (`FR-16` – `FR-23`)

### US-4.1: Animated PixiJS radial/force file-tree replay (`FR-16`, `FR-22`)
As a viewer, I want an animated WebGL file tree where directories branch cleanly and files appear, flash on edit, glide on rename, and fade on delete without chaotic node jumping.
- **Given** a loaded history in Replay view
- **When** playback advances through add, modify, rename, and delete events
- **Then** nodes animate each transition smoothly while existing unaffected nodes keep deterministic, stable coordinates across frames.

### US-4.2: Animated Treemap view (`FR-17`)
As a viewer, I want to switch to a Treemap view showing relative directory and file sizes evolving over time.
- **Given** a loaded history
- **When** I switch the view selector to "Treemap" and play or scrub
- **Then** nested directory/file rectangles update smoothly proportional to estimated file line counts, colored by top-level directory or extension.

### US-4.3: Contributor view and streamgraph (`FR-18`)
As a maintainer, I want a Contributor view showing contributor avatars/markers gravitating toward files they touch alongside an activity streamgraph.
- **Given** a loaded history
- **When** I switch to "Contributors"
- **Then** active contributors render as distinct labeled markers linked to touched files and a synchronized streamgraph plots commits/churn per contributor over time, with an option to hide or dim bots.

### US-4.4: Documentary HUD overlay (`FR-19`)
As a viewer, I want a clean HUD showing the current date, commit message, author, chapter name, and running stats (files, lines, contributors).
- **Given** playback is at commit index `k`
- **When** the frame renders
- **Then** the HUD displays escaped commit text, formatted date, canonical author, and accurate running counts of files, lines, and unique contributors.

### US-4.5: Timeline controls, chapters, and keyboard shortcuts (`FR-20`)
As a viewer, I want full playback controls (play/pause, speed, scrubber, chapter jump) operable via both pointer and keyboard.
- **Given** the replay screen is focused
- **When** I press `Space` (play/pause), `ArrowLeft`/`ArrowRight` (step), `[`/`]` (prev/next chapter), or drag the scrubber
- **Then** the virtual timeline responds immediately and updates ARIA status and controls cleanly.

### US-4.6: Adaptive documentary pacing (`FR-21`)
As a viewer, I want long inactive periods compressed and highlight moments lingered on, with a toggle to switch to constant speed.
- **Given** a history with a 6-month gap and a release highlight
- **When** adaptive pacing is enabled
- **Then** the virtual clock compresses the 6-month gap into a brief beat and slows down around highlights; switching to "Constant" advances uniformly per event.

### US-4.7: Large-repository scaling strategy (`FR-23`)
As a user inspecting a 5k+ commit repository, I want automatic aggregation (day/week buckets), deep directory collapsing, and a configurable node cap so the browser stays responsive.
- **Given** a history exceeding the large-repo threshold (e.g., > 2,000 events or > 5,000 active files)
- **When** loaded into the web app
- **Then** the large-repo strategy activates (with a visible badge and user-adjustable settings for bucket granularity, max depth, and node cap) keeping playback smooth.

---

## Epic 5: Architecture Comparison — v2 (`FR-24` – `FR-25`)

### US-5.1: Compare module dependency graphs between two refs (`FR-24`, `FR-25`)
As an architect, I want to pick two tags or commits and see how the TypeScript/JavaScript or Python module dependency graph changed between them.
- **Given** two refs (`refA`, `refB`) and source snapshots (via CLI or local folder / fixture)
- **When** I run Architecture Comparison using tree-sitter (WASM)
- **Then** imports/exports are parsed into directed module graphs for `refA` and `refB`
- **And** the UI renders side-by-side or diff overlay highlighting added nodes/edges in green, removed in red, and changed in amber.

---

## Epic 6: Export, Sharing & Optional Narration (`FR-26` – `FR-28`)

### US-6.1: Export MP4 and GIF clips (`FR-26`)
As a developer, I want to export my repository's documentary as a playable MP4 or GIF at my chosen resolution and duration, with progress and cancel controls.
- **Given** a loaded replay in the web app
- **When** I open Export, choose MP4 (WebCodecs + `mp4-muxer`, with fallback) or GIF, select resolution/FPS/duration, and click Export
- **Then** frames are deterministically stepped off the virtual clock, encoded with live progress percentage, cancelable at any time, and downloaded as a valid `.mp4` or `.gif` file.

### US-6.2: Shareable links (`FR-27`)
As a user, I want to copy a shareable link to the current view, timestamp, and settings (and repo slug when the optional backend is enabled).
- **Given** an active visualization session
- **When** I click "Share"
- **Then** a URL containing view mode, chapter/index, pacing/filter options (and backend repo ID when applicable) is copied to clipboard and restores that exact state on load.

### US-6.3: Pluggable optional narration (`FR-28`)
As an advanced user, I want an opt-in narration generator interface that turns detected highlights and chapters into documentary captions without shipping any API keys.
- **Given** narration is disabled by default
- **When** a user enables the built-in template narrator (or attaches a custom provider via the `NarrationProvider` interface)
- **Then** documentary captions are generated for chapters and highlights with zero hardcoded secrets or unsolicited network requests.
