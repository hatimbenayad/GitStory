# Tasks: U12 — Exporter (MP4 / GIF)

- [x] T12.1 Initialize `packages/exporter` with `mp4-muxer` and `gifenc`
- [x] T12.2 Write failing unit tests for GIF encoding (valid `GIF89a` magic bytes, multi-frame output), progress reporting, `AbortSignal` cancellation, and WebCodecs capability detection (`packages/exporter/test/exporter.test.ts`)
- [x] T12.3 Implement `capabilities.ts`, `gif-exporter.ts`, `mp4-exporter.ts`, and `index.ts`
- [x] T12.4 Implement `apps/web/src/components/ExportModal.tsx` and wire into `Toolbar`
- [x] T12.5 Extend Playwright E2E smoke test to export a short clip (`e2e/smoke.spec.ts` passing in headless Chrome)
- [x] T12.6 Verify lint, typecheck, tests, build and commit Bolt U12
