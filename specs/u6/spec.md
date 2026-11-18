# Spec: U6 — Web App Shell, Ingestion, Overlays & Controls

## 1. Purpose & Why
U6 completes the MVP by delivering the interactive React + Vite + Zustand web application (`apps/web`) and wiring `apps/cli`'s `serve` command to serve the built web app preloaded with the local repository.

## 2. Functional Requirements Covered
- `FR-2`: CLI starts web app on localhost with `/api/history.json` preloaded.
- `FR-3`: Drag-and-drop and file-picker upload of `history.json`.
- `FR-4`: Local folder ingestion via File System Access API (`window.showDirectoryPicker`) + `isomorphic-git` where supported, with a clear fallback notice on unsupported browsers.
- `FR-19`: Documentary HUD overlay (current date, commit message, author, chapter, running files/lines/contributors).
- `FR-20`: Timeline controls (play/pause, speed, scrubber, chapter markers/jump, keyboard shortcuts).
- `FR-27` (static permalink): Share button encoding view mode, index, pacing mode, and accessibility options in URL hash/query params.

## 3. Behavior & UX
- **Auto-preload:** On startup, check for `/api/history.json` (served by `gitstory serve`); if present, load automatically. Otherwise show the clean Landing/Ingestion screen with:
  1. Drag-and-drop `history.json` zone + file picker.
  2. "Open Local Folder" button (File System Access API feature detection; graceful fallback explanation if unsupported).
  3. Built-in interactive Sample Project button (so anyone can immediately test GitStory in one click without preparing a file).
  4. Placeholder/wired GitHub URL tab (fully enabled once U13 backend is configured).
- **Documentary HUD (`FR-19`):** Displays formatted commit date, chapter badge (if within/at a tag), escaped commit message, canonical author (with subtle bot badge if `isBot`), and live counters: Files, Lines, Contributors, Commit `i / N`.
- **Playback Controls & Shortcuts (`FR-20`):**
  - `Space`: Play / Pause
  - `ArrowLeft` / `ArrowRight`: Step backward / forward 1 commit
  - `[` / `]`: Previous / Next Chapter (tag)
  - `0` / `Home`: Jump to start
  - Speed selector (`0.5x`, `1x`, `2x`, `4x`, `8x`)
  - Pacing toggle (`Adaptive` / `Constant`)
  - View switcher (`Replay` now; `Treemap`, `Contributors`, `Arch Diff` plugged in by U8/U9/U14)
  - Accessibility drawer: `Reduced Motion` (initialized from `prefers-reduced-motion`), `Colorblind-Safe Palette`, `Hide/Dim Bots`.
- **Security:** Every string from `history.json` is rendered exclusively via React escaped text nodes (never `dangerouslySetInnerHTML`).
