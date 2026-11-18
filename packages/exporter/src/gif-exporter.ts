import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { ExportCancelledError, extractRgbaBuffer, type ExportOptions, type FrameRenderer } from './types.js';

/**
 * Encodes deterministic frames into an animated GIF89a `Blob` using pure-TS `gifenc`.
 */
export async function exportGif(
  renderFrame: FrameRenderer,
  options: ExportOptions,
): Promise<Blob> {
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)));
  const totalFrames = Math.max(1, Math.round(options.durationSec * fps));
  const delayMs = Math.max(20, Math.round(1000 / fps));

  const gif = GIFEncoder();

  for (let i = 0; i < totalFrames; i++) {
    if (options.signal?.aborted) {
      throw new ExportCancelledError();
    }

    const timeSec = totalFrames === 1 ? 0 : (i / (totalFrames - 1)) * options.durationSec;
    const source = await renderFrame(timeSec, i, totalFrames);

    if (options.signal?.aborted) {
      throw new ExportCancelledError();
    }

    const rgba = extractRgbaBuffer(source, options.width, options.height);
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);

    gif.writeFrame(index, options.width, options.height, {
      palette,
      delay: delayMs,
      ...(i === 0 ? { repeat: 0 } : {}),
    });

    options.onProgress?.({
      frame: i + 1,
      totalFrames,
      percent: Math.min(99, Math.round(((i + 1) / totalFrames) * 95)),
      stage: 'encoding',
    });

    // Yield to browser event loop periodically so UI cancel buttons stay responsive
    if (i % 4 === 3) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  gif.finish();
  options.onProgress?.({
    frame: totalFrames,
    totalFrames,
    percent: 100,
    stage: 'finalizing',
  });

  const outBytes = gif.bytes();
  const copy = new Uint8Array(outBytes.byteLength);
  copy.set(outBytes);
  return new Blob([copy], { type: 'image/gif' });
}
