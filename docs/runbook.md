# GitStory Operations Runbook

## 1. Running Locally

### Full Workspace Build & Verify
```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

### CLI Local Repository Analysis
```bash
# Extract history.json
node apps/cli/dist/cli.js <repo-path> -o history.json

# Extract full branch history (instead of default first-parent)
node apps/cli/dist/cli.js <repo-path> --full-history -o history.json

# Serve preloaded web app on localhost
node apps/cli/dist/cli.js serve <repo-path> --port 4173

# Generate AST/module architecture diff between two refs
node apps/cli/dist/cli.js arch <repo-path> <refA> <refB> -o arch-diff.json
```

### Optional Public GitHub Clone Backend
```bash
PORT=8787 CACHE_DIR=.gitstory-cache CORS_ORIGIN=http://localhost:5173 pnpm --filter @gitstory/server start
```

## 2. Debugging Tips
- **WebGL fallback:** If PixiJS cannot acquire a WebGL context (e.g., headless CI or disabled GPU), `ReplayRenderer` automatically falls back to Canvas2D (`drawTreeFrameToCanvas2D`). Inspect `renderer.isUsingWebGL()` if diagnosing GPU issues.
- **Worker / IndexedDB cache:** History validation and highlight detection run in `apps/web/src/workers/history.worker.ts` and cache under IndexedDB database `gitstory-cache-v1`. Clear site storage in DevTools to force cold reprocessing.
- **Streaming extractor:** Run `pnpm --filter @gitstory/extractor typecheck` and inspect `packages/extractor/test/stream-parser.test.ts` to reproduce nasty filename or chunk-boundary issues offline.

## 3. Benchmarking & Regenerating the Demo
```bash
# Synthetic 5,000- and 10,000-commit benchmark
pnpm bench

# Regenerate docs/demo/gitstory-demo.gif from GitStory's own Git history
node scripts/generate-demo.mjs
```

## 4. How to Add a New Visualization View
1. **Spec it first:** Add or update a spec in `specs/` and record any layout/rendering ADRs in `docs/decisions/`.
2. **Add pure layout math in `packages/layout/src/`:** Accept `RepoState` or `History` and viewport dimensions; export pure typed geometry with unit tests (no DOM dependencies so it runs in Node and Web Workers).
3. **Create the React component in `apps/web/src/components/`:** Read `currentState`, `snapshot`, `colorblindSafe`, `reducedMotion`, and `botVisibility` from `useStoryStore`.
4. **Register the view mode:**
   - Add the new view ID to `ViewMode` in `apps/web/src/lib/urlState.ts`.
   - Add the tab button to `VIEWS` in `apps/web/src/components/Toolbar.tsx`.
   - Render the component conditionally in `apps/web/src/App.tsx`.
5. **Verify:** Run `pnpm build && pnpm lint && pnpm typecheck && pnpm test` and add a view-switch assertion in `e2e/smoke.spec.ts`.
