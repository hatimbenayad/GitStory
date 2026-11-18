export interface ExportCapabilities {
  gif: boolean;
  webCodecsMp4: boolean;
}

/**
 * Detects browser encoding capabilities (`ADR-003`, `FR-26`).
 */
export function getExportCapabilities(): ExportCapabilities {
  const g = globalThis as unknown as {
    VideoEncoder?: unknown;
    VideoFrame?: unknown;
  };
  return {
    gif: true,
    webCodecsMp4: typeof g.VideoEncoder === 'function' && typeof g.VideoFrame === 'function',
  };
}
