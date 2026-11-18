import { exportGif } from './gif-exporter.js';
import { exportMp4 } from './mp4-exporter.js';
import type { ExportOptions, FrameRenderer } from './types.js';

export { getExportCapabilities, type ExportCapabilities } from './capabilities.js';
export {
  ExportCancelledError,
  type CanvasFrame,
  type ExportFormat,
  type ExportOptions,
  type ExportProgress,
  type FrameRenderer,
  type FrameSource,
  type RgbaFrame,
} from './types.js';

/**
 * Exports a deterministic frame sequence to an MP4 (`video/mp4`) or GIF (`image/gif`) `Blob`
 * with progress reporting and `AbortSignal` cancellation (`FR-26`).
 */
export async function exportAnimation(
  renderFrame: FrameRenderer,
  options: ExportOptions,
): Promise<Blob> {
  if (options.format === 'mp4') {
    return exportMp4(renderFrame, options);
  }
  return exportGif(renderFrame, options);
}
