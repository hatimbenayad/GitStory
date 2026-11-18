export type ExportFormat = 'mp4' | 'gif';

export interface RgbaFrame {
  kind: 'rgba';
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface CanvasFrame {
  kind: 'canvas';
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

export type FrameSource = RgbaFrame | CanvasFrame;

export type FrameRenderer = (
  timeSec: number,
  frameIndex: number,
  totalFrames: number,
) => Promise<FrameSource> | FrameSource;

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  percent: number;
  stage: 'rendering' | 'encoding' | 'finalizing';
}

export interface ExportOptions {
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  bitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

/**
 * Thrown when a user cancels an active export via `AbortSignal`.
 */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled by user');
    this.name = 'ExportCancelledError';
  }
}

/**
 * Extracts raw RGBA pixel bytes from either a `CanvasFrame` or `RgbaFrame`.
 */
export function extractRgbaBuffer(
  source: FrameSource,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (source.kind === 'rgba') {
    return source.data;
  }
  const ctx = source.canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new Error('Could not obtain 2D context from export canvas');
  }
  return ctx.getImageData(0, 0, width, height).data;
}
