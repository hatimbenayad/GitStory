import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ReplayEngine, buildChapters, detectHighlights } from '../packages/core/dist/index.js';
import { exportAnimation } from '../packages/exporter/dist/index.js';
import { extractHistory } from '../packages/extractor/dist/index.js';
import { StableTreeLayout, getPaletteColor } from '../packages/layout/dist/index.js';
import { TimelineEngine } from '../packages/timeline/dist/index.js';

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '');
  const n = Number.parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blendPixel(buf, width, height, x, y, r, g, b, alpha) {
  if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0) return;
  const idx = (y * width + x) * 4;
  const a = Math.min(1, alpha);
  const inv = 1 - a;
  buf[idx] = Math.round(buf[idx] * inv + r * a);
  buf[idx + 1] = Math.round(buf[idx + 1] * inv + g * a);
  buf[idx + 2] = Math.round(buf[idx + 2] * inv + b * a);
  buf[idx + 3] = 255;
}

function drawLine(buf, width, height, x0, y0, x1, y1, rgb, alpha) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i++) {
    const px = Math.round(x0 + (dx * i) / steps);
    const py = Math.round(y0 + (dy * i) / steps);
    blendPixel(buf, width, height, px, py, rgb[0], rgb[1], rgb[2], alpha);
  }
}

function drawCircle(buf, width, height, cx, cy, radius, rgb, alpha) {
  const rCeil = Math.ceil(radius + 1);
  const xMin = Math.max(0, Math.floor(cx - rCeil));
  const xMax = Math.min(width - 1, Math.ceil(cx + rCeil));
  const yMin = Math.max(0, Math.floor(cy - rCeil));
  const yMax = Math.min(height - 1, Math.ceil(cy + rCeil));

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius + 0.8) {
        const edge = d > radius - 0.6 ? Math.max(0, 1 - (d - (radius - 0.6)) / 1.4) : 1;
        blendPixel(buf, width, height, x, y, rgb[0], rgb[1], rgb[2], alpha * edge);
      }
    }
  }
}

function drawRing(buf, width, height, cx, cy, radius, rgb, alpha) {
  const rCeil = Math.ceil(radius + 2);
  const xMin = Math.max(0, Math.floor(cx - rCeil));
  const xMax = Math.min(width - 1, Math.ceil(cx + rCeil));
  const yMin = Math.max(0, Math.floor(cy - rCeil));
  const yMax = Math.min(height - 1, Math.ceil(cy + rCeil));

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const d = Math.abs(Math.hypot(x - cx, y - cy) - radius);
      if (d <= 1.4) {
        blendPixel(buf, width, height, x, y, rgb[0], rgb[1], rgb[2], alpha * (1 - d / 1.4));
      }
    }
  }
}

function drawRect(buf, width, height, x0, y0, w, h, rgb, alpha) {
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(width, Math.ceil(x0 + w));
  const yEnd = Math.min(height, Math.ceil(y0 + h));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      blendPixel(buf, width, height, x, y, rgb[0], rgb[1], rgb[2], alpha);
    }
  }
}

async function main() {
  const repoPath = resolve('.');
  const history = await extractHistory({ repoPath, repoName: 'GitStory' });
  const chapters = buildChapters(history);
  const highlights = detectHighlights(history);
  const replay = new ReplayEngine(history);
  const timeline = new TimelineEngine(history.events, {
    mode: 'adaptive',
    targetDurationSec: 6,
    chapters,
    highlights,
  });

  const width = 640;
  const height = 360;
  const fps = 10;
  const durationSec = 6;

  // Precompute final framing
  const layout = new StableTreeLayout();
  const finalFrame = layout.compute(replay.getStateAt(Math.max(0, history.events.length - 1)));
  layout.reset();

  const pad = 45;
  const spanX = Math.max(240, finalFrame.bounds.maxX - finalFrame.bounds.minX + pad * 2);
  const spanY = Math.max(180, finalFrame.bounds.maxY - finalFrame.bounds.minY + pad * 2);
  const scale = Math.max(0.2, Math.min(1.1, Math.min(width / spanX, (height - 40) / spanY)));
  const cxWorld = (finalFrame.bounds.minX + finalFrame.bounds.maxX) / 2;
  const cyWorld = (finalFrame.bounds.minY + finalFrame.bounds.maxY) / 2;

  const toScreenX = (wx) => width / 2 + (wx - cxWorld) * scale;
  const toScreenY = (wy) => height / 2 - 6 + (wy - cyWorld) * scale;

  let lastIdx = -999;
  let cachedFrame = finalFrame;

  const blob = await exportAnimation(
    (timeSec) => {
      const snap = timeline.sampleAtTime(timeSec);
      if (snap.eventIndex !== lastIdx) {
        cachedFrame = layout.compute(replay.getStateAt(snap.eventIndex));
        lastIdx = snap.eventIndex;
      }

      const data = new Uint8ClampedArray(width * height * 4);
      // Dark vignette background
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dist = Math.hypot((x - width / 2) / (width * 0.6), (y - height / 2) / (height * 0.6));
          const v = Math.max(0, 1 - dist);
          const idx = (y * width + x) * 4;
          data[idx] = Math.round(7 + v * 12);
          data[idx + 1] = Math.round(10 + v * 18);
          data[idx + 2] = Math.round(18 + v * 30);
          data[idx + 3] = 255;
        }
      }

      const easeOut = 1 - (1 - snap.eventProgress) * (1 - snap.eventProgress);

      // Edges
      for (const e of cachedFrame.edges) {
        drawLine(
          data,
          width,
          height,
          toScreenX(e.x1),
          toScreenY(e.y1),
          toScreenX(e.x2),
          toScreenY(e.y2),
          [148, 163, 184],
          0.26,
        );
      }

      // Nodes
      for (const node of cachedFrame.nodes) {
        const sx = toScreenX(node.x);
        const sy = toScreenY(node.y);
        let r = Math.max(2, node.radius * scale);
        if (node.changeType === 'A') {
          r = r * (0.35 + 0.65 * easeOut);
        }

        const rgb =
          node.kind === 'dir'
            ? node.depth === 0
              ? [248, 250, 252]
              : [100, 116, 139]
            : hexToRgb(getPaletteColor(node.ext || node.topDir, false));

        if (node.changeType) {
          const haloRgb =
            node.changeType === 'A'
              ? [52, 211, 153]
              : node.changeType === 'R'
                ? [56, 189, 248]
                : [251, 191, 36];
          drawRing(data, width, height, sx, sy, r + 2.5 + easeOut * 5, haloRgb, 0.75 * (1 - easeOut * 0.5));
        }

        drawCircle(data, width, height, sx, sy, r, rgb, 0.96);
      }

      // Bottom documentary timeline bar
      drawRect(data, width, height, 20, height - 16, width - 40, 5, [36, 50, 74], 0.9);
      drawRect(
        data,
        width,
        height,
        20,
        height - 16,
        Math.max(4, (width - 40) * snap.progress),
        5,
        [56, 189, 248],
        1,
      );

      return { kind: 'rgba', width, height, data };
    },
    { format: 'gif', width, height, fps, durationSec },
  );

  const outPath = resolve('docs/demo/gitstory-demo.gif');
  mkdirSync(dirname(outPath), { recursive: true });
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(
    `Generated ${outPath} (${(buf.length / 1024).toFixed(1)} KB) from ${history.events.length} commits of GitStory itself`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
