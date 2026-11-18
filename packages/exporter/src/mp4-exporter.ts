import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { getExportCapabilities } from './capabilities.js';
import { ExportCancelledError, type ExportOptions, type FrameRenderer } from './types.js';

// Minimal WebCodecs type shims so Node + DOM TS builds cleanly everywhere
interface WebCodecsVideoFrame {
  close(): void;
}
interface WebCodecsVideoEncoder {
  configure(config: {
    codec: string;
    width: number;
    height: number;
    bitrate: number;
    framerate: number;
  }): void;
  encode(frame: WebCodecsVideoFrame, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

/**
 * Encodes deterministic canvas frames into an H.264 MP4 `Blob` via WebCodecs + `mp4-muxer`
 * (`ADR-003`, `FR-26`). Ensures even dimensions required by H.264.
 */
export async function exportMp4(
  renderFrame: FrameRenderer,
  options: ExportOptions,
): Promise<Blob> {
  if (!getExportCapabilities().webCodecsMp4) {
    throw new Error(
      'WebCodecs VideoEncoder is not available in this browser. Switch export format to GIF or use a Chromium/Safari browser with WebCodecs enabled.',
    );
  }

  // H.264 requires even width and height
  const width = options.width % 2 === 0 ? options.width : options.width + 1;
  const height = options.height % 2 === 0 ? options.height : options.height + 1;
  const fps = Math.max(1, Math.min(60, Math.round(options.fps)));
  const totalFrames = Math.max(1, Math.round(options.durationSec * fps));
  const bitrate = options.bitrate ?? 4_000_000;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const g = globalThis as unknown as {
    VideoEncoder: new (init: {
      output: (chunk: unknown, meta?: unknown) => void;
      error: (err: Error) => void;
    }) => WebCodecsVideoEncoder;
    VideoFrame: new (
      source: HTMLCanvasElement | OffscreenCanvas,
      init: { timestamp: number; duration: number },
    ) => WebCodecsVideoFrame;
  };

  const encoder = new g.VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk as never, meta as never);
    },
    error: (err) => {
      encodeError = err;
    },
  });

  encoder.configure({
    codec: 'avc1.42001f',
    width,
    height,
    bitrate,
    framerate: fps,
  });

  try {
    const frameDurationUs = Math.round(1_000_000 / fps);

    for (let i = 0; i < totalFrames; i++) {
      if (options.signal?.aborted) {
        throw new ExportCancelledError();
      }
      if (encodeError) throw encodeError;

      const timeSec = totalFrames === 1 ? 0 : (i / (totalFrames - 1)) * options.durationSec;
      const source = await renderFrame(timeSec, i, totalFrames);

      if (source.kind !== 'canvas') {
        throw new Error('MP4 WebCodecs export requires a canvas frame source');
      }

      const vf = new g.VideoFrame(source.canvas, {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });

      encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();

      options.onProgress?.({
        frame: i + 1,
        totalFrames,
        percent: Math.min(95, Math.round(((i + 1) / totalFrames) * 90)),
        stage: 'encoding',
      });

      if (i % 5 === 4) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    await encoder.flush();
    muxer.finalize();

    options.onProgress?.({
      frame: totalFrames,
      totalFrames,
      percent: 100,
      stage: 'finalizing',
    });

    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    try {
      encoder.close();
    } catch {
      // ignore double close
    }
  }
}
