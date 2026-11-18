# Spec: U12 — Exporter (MP4 / GIF)

## 1. Purpose & Why
Developers want to share their project's documentary in READMEs, talks, and social media posts (`FR-26`). U12 delivers `@gitstory/exporter` and an interactive Export modal in `apps/web` supporting deterministic MP4 and GIF export with progress reporting and cancellation.

## 2. Functional Requirements Covered
- `FR-26`: Export MP4 and GIF at selectable resolution/duration; progress indicator; cancelable.

## 3. Data Contracts (`@gitstory/exporter`)
```ts
export type ExportFormat = 'mp4' | 'gif';

export interface ExportOptions {
  format: ExportFormat;
  width: number;           // e.g. 1280, 1920, 800
  height: number;          // e.g. 720, 1080, 450
  fps: number;             // e.g. 15 (GIF), 30 (MP4)
  durationSec: number;     // e.g. 5..60
  bitrate?: number;        // MP4 bits/sec (default 4_000_000)
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percent: number;         // 0..100
  stage: 'rendering' | 'encoding' | 'finalizing';
}

export function exportAnimation(
  renderFrame: (timeSec: number, frameIndex: number, totalFrames: number) => Promise<FrameSource> | FrameSource,
  options: ExportOptions
): Promise<Blob>;
```

## 4. Behavior & Fallbacks (per ADR-003)
- **GIF:** Uses lightweight pure-TS `gifenc` quantization + GIF89a encoding directly on RGBA `Uint8ClampedArray` pixel buffers; works in all browsers and Node/Vitest.
- **MP4:** Uses WebCodecs `VideoEncoder` (`avc1.42001f`) + `mp4-muxer` (`ArrayBufferTarget`). If `VideoEncoder` is unavailable in the browser, exposes `getExportCapabilities()` so UI offers fallback (`ffmpeg.wasm` hook or GIF export) with a clear status message.
- **Cancellation:** Checks `options.signal?.aborted` before every frame; throws `ExportCancelledError` and cleanly disposes encoders on abort.
- **UI Modal:** Select format (MP4 / GIF), preset resolution (720p / 1080p / Compact 640×360), duration, FPS, live progress bar, Cancel button, and automatic file download on completion.
