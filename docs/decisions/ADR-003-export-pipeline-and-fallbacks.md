# ADR-003: Browser Export Pipeline (MP4 & GIF) and Fallbacks

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** `FR-26`, Unit `U12`

## Context
WebCodecs (`VideoEncoder`) is supported in modern Chromium and Safari but may be absent in older browsers or headless test environments. Users need reliable MP4 and GIF export with progress reporting and cancellation.

## Decision
1. **Deterministic Frame Stepping:** The exporter drives `TimelineEngine` at exact timestamps `t = i / fps` (`0 <= i < durationSec * fps`) and captures each rendered canvas frame, decoupling export speed from realtime playback FPS.
2. **MP4 Path:**
   - Primary: WebCodecs `VideoEncoder` (`avc1.42001f` / H.264) muxed with `mp4-muxer` into an `ArrayBufferTarget` MP4 `Blob`.
   - Fallback: Lazy-loaded `@ffmpeg/ffmpeg` (`ffmpeg.wasm`) when `VideoEncoder` is unavailable, or clear user prompt to switch to GIF if SharedArrayBuffer/WASM is unavailable.
3. **GIF Path:**
   - Pure TypeScript lightweight GIF89a encoder (`gifenc`) operating directly on `ImageData` RGBA buffers with NeuQuant/palette quantization (256 colors), running cleanly in every browser and in Node/Vitest without native binaries or cross-origin isolation headers.
4. **Cancellation:** All export pipelines accept an `AbortSignal` checked on every frame boundary and clean up encoders immediately on abort.

## Consequences
- Zero-dependency reliable GIF export everywhere, high-quality hardware-accelerated MP4 via WebCodecs + `mp4-muxer`, and graceful fallback when WebCodecs is absent.
