# Plan: U6 — Web App Shell, Ingestion, Overlays & Controls

## 1. Technical Approach
- React 19 (or 18) + Vite 6 + TypeScript strict + Zustand store (`apps/web/src/store/useStoryStore.ts`).
- Clean dark documentary aesthetic using vanilla CSS variables (fast, zero CSS-in-JS runtime overhead, WCAG AA contrast, responsive layout).
- Modular components:
  - `LandingView`: Dropzone, file input, File System Access API local folder loader (`src/lib/localFolderLoader.ts` using `isomorphic-git` over a virtual `fs` adapter wrapping `FileSystemDirectoryHandle`), Sample Repo generator, optional GitHub URL tab.
  - `HudOverlay`: Escaped commit metadata, running stats, chapter banner, highlight toast.
  - `TimelineBar`: Accessible `<input type="range">` / custom scrubber with clickable tag chapter ticks, highlight markers, play/pause, speed, pacing mode, keyboard shortcut hook.
  - `Toolbar`: View switcher, settings popover (reduced motion, colorblind palette, hide/dim bots), Share permalink button, Export button (wired in U12), Load New Repo button.
- Wire `apps/cli/src/serve.ts` to locate `apps/web/dist` and serve it alongside `/api/history.json`.

## 2. Testing
- Unit tests for Zustand store & URL state serialization (`apps/web/test/store.test.ts`).
- Playwright E2E smoke test (`e2e/smoke.spec.ts`): launch Vite preview, upload fixture `history.json`, verify replay canvas renders, play, scrub, jump chapter, verify HUD updates.
