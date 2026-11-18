import { useEffect, useRef, useState } from 'react';
import { computeTreemapLayout, getPaletteColor, type TreemapRect } from '@gitstory/layout';
import { useStoryStore } from '../store/useStoryStore.js';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function TreemapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevRectsRef = useRef<Map<string, TreemapRect>>(new Map());
  const currentRectsRef = useRef<TreemapRect[]>([]);
  const [size, setSize] = useState({ width: 900, height: 540 });
  const [hover, setHover] = useState<{ rect: TreemapRect; x: number; y: number } | null>(null);

  const currentState = useStoryStore((s) => s.currentState);
  const snapshot = useStoryStore((s) => s.snapshot);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);
  const reducedMotion = useStoryStore((s) => s.reducedMotion);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({
        width: Math.max(300, Math.floor(r.width)),
        height: Math.max(220, Math.floor(r.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentState || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Reserve top space for HUD
    const padTop = 94;
    const padSide = 16;
    const padBottom = 16;
    const innerW = Math.max(100, size.width - padSide * 2);
    const innerH = Math.max(100, size.height - padTop - padBottom);

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, size.width, size.height);

    const targetRects = computeTreemapLayout(currentState, innerW, innerH).map((r) => ({
      ...r,
      x0: r.x0 + padSide,
      x1: r.x1 + padSide,
      y0: r.y0 + padTop,
      y1: r.y1 + padTop,
    }));

    const t = reducedMotion ? 1 : Math.min(1, 0.3 + snapshot.eventProgress * 0.7);
    const activePaths = new Set(currentState.activeEvent?.changes.map((c) => c.path) ?? []);

    const drawnRects: TreemapRect[] = [];
    for (const r of targetRects) {
      const prev = prevRectsRef.current.get(r.id);
      const x0 = prev ? lerp(prev.x0, r.x0, t) : r.x0;
      const y0 = prev ? lerp(prev.y0, r.y0, t) : r.y0;
      const x1 = prev ? lerp(prev.x1, r.x1, t) : r.x1;
      const y1 = prev ? lerp(prev.y1, r.y1, t) : r.y1;
      const w = Math.max(0, x1 - x0);
      const h = Math.max(0, y1 - y0);
      const interpolated = { ...r, x0, y0, x1, y1 };
      drawnRects.push(interpolated);

      if (r.kind === 'dir') {
        ctx.fillStyle = r.depth === 1 ? 'rgba(30, 41, 59, 0.68)' : 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));

        if (w > 48 && h > 18) {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + 4, y0, Math.max(0, w - 8), 18);
          ctx.clip();
          ctx.fillText(r.name, x0 + 6, y0 + 13);
          ctx.restore();
        }
      } else {
        const baseColor = getPaletteColor(r.ext || r.topDir, colorblindSafe);
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = activePaths.has(r.path) ? 1 : 0.78;
        ctx.fillRect(x0, y0, w, h);
        ctx.globalAlpha = 1;

        if (activePaths.has(r.path)) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x0 + 1, y0 + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        }

        if (w > 54 && h > 20) {
          ctx.fillStyle = '#06101f';
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0 + 3, y0 + 2, Math.max(0, w - 6), Math.max(0, h - 4));
          ctx.clip();
          ctx.fillText(r.name, x0 + 5, y0 + 14);
          if (h > 34) {
            ctx.font = '500 10px system-ui, sans-serif';
            ctx.fillText(`${r.lines} ln`, x0 + 5, y0 + 27);
          }
          ctx.restore();
        }
      }
    }

    currentRectsRef.current = drawnRects;
    const nextMap = new Map<string, TreemapRect>();
    for (const r of targetRects) nextMap.set(r.id, r);
    prevRectsRef.current = nextMap;

    ctx.restore();
  }, [currentState, snapshot, size, colorblindSafe, reducedMotion]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Prefer leaf files over enclosing dirs
    const leaves = currentRectsRef.current.filter((r) => r.kind === 'file');
    const hit = leaves.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    setHover(hit ? { rect: hit, x, y } : null);
  };

  return (
    <div
      ref={containerRef}
      data-testid="treemap-view"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.x + 14, size.width - 300),
            top: Math.max(12, hover.y - 12),
          }}
        >
          <div style={{ fontWeight: 600 }}>{hover.rect.path}</div>
          <div style={{ color: '#94a3b8' }}>
            {hover.rect.lines.toLocaleString()} lines
            {hover.rect.ext ? ` · .${hover.rect.ext}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
