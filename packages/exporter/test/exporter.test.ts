import { describe, expect, it } from 'vitest';
import {
  ExportCancelledError,
  exportAnimation,
  getExportCapabilities,
  type RgbaFrame,
} from '../src/index.js';

function makeSolidFrame(width: number, height: number, r: number, g: number, b: number): RgbaFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { kind: 'rgba', width, height, data };
}

describe('@gitstory/exporter (U12 / FR-26)', () => {
  it('encodes a valid multi-frame GIF89a blob with progress callbacks', async () => {
    const progressEvents: number[] = [];
    const blob = await exportAnimation(
      (_timeSec, frameIdx) => makeSolidFrame(32, 24, (frameIdx * 40) % 255, 120, 220),
      {
        format: 'gif',
        width: 32,
        height: 24,
        fps: 5,
        durationSec: 1,
        onProgress: (p) => progressEvents.push(p.percent),
      },
    );

    expect(blob.type).toBe('image/gif');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // GIF89a magic bytes
    const header = String.fromCharCode(...bytes.slice(0, 6));
    expect(header).toBe('GIF89a');
    expect(bytes.length).toBeGreaterThan(50);
    expect(progressEvents[progressEvents.length - 1]).toBe(100);
  });

  it('supports immediate cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    let rendered = 0;

    await expect(
      exportAnimation(
        () => {
          rendered++;
          if (rendered === 2) controller.abort();
          return makeSolidFrame(16, 16, 10, 20, 30);
        },
        {
          format: 'gif',
          width: 16,
          height: 16,
          fps: 10,
          durationSec: 2,
          signal: controller.signal,
        },
      ),
    ).rejects.toBeInstanceOf(ExportCancelledError);

    expect(rendered).toBeLessThan(10);
  });

  it('reports runtime MP4/GIF capabilities cleanly', () => {
    const caps = getExportCapabilities();
    expect(caps.gif).toBe(true);
    expect(typeof caps.webCodecsMp4).toBe('boolean');
  });
});
