# Plan: U12 — Exporter (MP4 / GIF)

## 1. Technical Approach
- Create `packages/exporter` with dependencies `mp4-muxer` and `gifenc`.
- Implement:
  - `src/capabilities.ts`: Detects WebCodecs (`VideoEncoder` + `VideoFrame`) availability.
  - `src/gif-exporter.ts`: Pure-TS GIF89a encoder reading RGBA frames via `gifenc` (`quantize`, `applyPalette`, `GIFEncoder`).
  - `src/mp4-exporter.ts`: WebCodecs `VideoEncoder` + `mp4-muxer` pipeline, with optional lazy `ffmpeg.wasm` fallback adapter when WebCodecs is unavailable.
  - `src/index.ts`: Unified `exportAnimation()` orchestrator with `ExportCancelledError` and progress reporting.
- Add `apps/web/src/components/ExportModal.tsx` driving a dedicated offscreen/sized render pass off `TimelineEngine.sampleAtTime()` so export produces crisp deterministic frames including HUD overlay.
