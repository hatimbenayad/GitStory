import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StableTreeLayout,
  computeActiveContributors,
  computeContributorStream,
} from '@gitstory/layout';
import { useStoryStore } from '../store/useStoryStore.js';

export function ContributorView() {
  const topWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef(new StableTreeLayout());
  const avatarPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 340 });

  const history = useStoryStore((s) => s.history);
  const currentState = useStoryStore((s) => s.currentState);
  const snapshot = useStoryStore((s) => s.snapshot);
  const botVisibility = useStoryStore((s) => s.botVisibility);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);
  const reducedMotion = useStoryStore((s) => s.reducedMotion);
  const seekToProgress = useStoryStore((s) => s.seekToProgress);

  useEffect(() => {
    layoutRef.current.reset();
    avatarPosRef.current.clear();
  }, [history]);

  useEffect(() => {
    const el = topWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(300, Math.floor(r.width)),
        height: Math.max(180, Math.floor(r.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const streamData = useMemo(() => {
    if (!history) return null;
    return computeContributorStream(history, {
      bucketCount: 36,
      topN: 8,
      hideBots: botVisibility === 'hide',
      colorblindSafe,
    });
  }, [history, botVisibility, colorblindSafe]);

  // Draw active contributor avatar stage + file links
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !history || !currentState || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvasSize.width * dpr);
    canvas.height = Math.floor(canvasSize.height * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const frame = layoutRef.current.compute(currentState);
    const pad = 70;
    const spanX = Math.max(220, frame.bounds.maxX - frame.bounds.minX + pad * 2);
    const spanY = Math.max(220, frame.bounds.maxY - frame.bounds.minY + pad * 2);
    const scale = Math.max(
      0.18,
      Math.min(1.2, Math.min(canvasSize.width / spanX, (canvasSize.height - 60) / spanY)),
    );
    const cx = (frame.bounds.minX + frame.bounds.maxX) / 2;
    const cy = (frame.bounds.minY + frame.bounds.maxY) / 2;

    ctx.translate(canvasSize.width / 2 - cx * scale, canvasSize.height / 2 + 24 - cy * scale);
    ctx.scale(scale, scale);

    // Subtle file tree backdrop
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = Math.max(0.6, 1 / scale);
    for (const e of frame.edges) {
      ctx.beginPath();
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
      ctx.stroke();
    }

    const nodeByPath = new Map(frame.nodes.map((n) => [n.path, n]));
    for (const n of frame.nodes) {
      ctx.fillStyle = n.kind === 'dir' ? 'rgba(100, 116, 139, 0.45)' : 'rgba(148, 163, 184, 0.35)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active contributors gravitating toward touched files
    const active = computeActiveContributors(history, snapshot.eventIndex, {
      windowSize: 10,
      hideBots: botVisibility === 'hide',
      colorblindSafe,
    });

    for (let i = 0; i < active.length; i++) {
      const c = active[i]!;
      const targets = c.touchedPaths
        .map((p) => nodeByPath.get(p))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));

      let targetX = Math.cos(i * 1.4) * 140;
      let targetY = Math.sin(i * 1.4) * 140;
      if (targets.length > 0) {
        let sx = 0;
        let sy = 0;
        for (const t of targets) {
          sx += t.x;
          sy += t.y;
        }
        targetX = sx / targets.length + Math.cos(i * 2.1) * 34;
        targetY = sy / targets.length + Math.sin(i * 2.1) * 34;
      }

      const prev = avatarPosRef.current.get(c.authorId);
      const lerpFactor = reducedMotion || !prev ? 1 : 0.35;
      const drawX = prev ? prev.x + (targetX - prev.x) * lerpFactor : targetX;
      const drawY = prev ? prev.y + (targetY - prev.y) * lerpFactor : targetY;
      avatarPosRef.current.set(c.authorId, { x: drawX, y: drawY });

      const alpha = (c.isBot && botVisibility === 'dim' ? 0.35 : 0.95) * (0.4 + c.recency * 0.6);

      // Beams to touched files
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = Math.max(1.2, 1.8 / scale);
      for (const t of targets.slice(0, 6)) {
        ctx.beginPath();
        ctx.moveTo(drawX, drawY);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();

        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius + 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Contributor avatar circle
      const r = Math.max(13, 16 / Math.sqrt(scale));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#070a12';
      ctx.lineWidth = 2 / Math.sqrt(scale);
      ctx.stroke();

      ctx.fillStyle = '#06101f';
      ctx.font = `700 ${Math.round(r * 0.72)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.initials, drawX, drawY + 0.5);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 ${Math.round(r * 0.65)}px system-ui, sans-serif`;
      ctx.fillText(c.name.slice(0, 18), drawX, drawY + r + 10 / Math.sqrt(scale));
      ctx.restore();
    }

    ctx.restore();
  }, [history, currentState, snapshot, canvasSize, botVisibility, colorblindSafe, reducedMotion]);

  if (!history || !snapshot || !streamData) return null;

  const svgW = 1000;
  const svgH = 150;
  const rangeY = Math.max(1, streamData.maxY - streamData.minY);
  const toX = (b: number) =>
    streamData.bucketCount <= 1 ? svgW / 2 : (b / (streamData.bucketCount - 1)) * svgW;
  const toY = (v: number) => 12 + ((streamData.maxY - v) / rangeY) * (svgH - 24);

  const buildAreaPath = (pts: typeof streamData.series[number]['points']): string => {
    if (pts.length === 0) return '';
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.bucketIndex).toFixed(1)},${toY(p.y1).toFixed(1)}`).join(' ');
    const bottom = [...pts]
      .reverse()
      .map((p) => `L${toX(p.bucketIndex).toFixed(1)},${toY(p.y0).toFixed(1)}`)
      .join(' ');
    return `${top} ${bottom} Z`;
  };

  const playheadX = snapshot.progress * svgW;

  return (
    <div
      data-testid="contributors-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#070a12',
      }}
    >
      <div ref={topWrapRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      <section
        aria-label="Contributor activity streamgraph"
        style={{
          height: 205,
          borderTop: '1px solid #24324a',
          background: '#0b1020',
          padding: '0.6rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
            Contributor Activity Streamgraph (click to scrub)
          </span>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.74rem' }}>
            {streamData.series.slice(0, 7).map((s) => (
              <span
                key={s.authorId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  opacity: s.isBot && botVisibility === 'dim' ? 0.45 : 1,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background: s.color,
                    display: 'inline-block',
                  }}
                />
                <span>
                  {s.name} ({s.totalCommits})
                </span>
              </span>
            ))}
          </div>
        </div>

        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          style={{ width: '100%', flex: 1, cursor: 'pointer', display: 'block' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / Math.max(1, rect.width);
            seekToProgress(Math.max(0, Math.min(1, frac)));
          }}
        >
          {streamData.series.map((s) => (
            <path
              key={s.authorId}
              d={buildAreaPath(s.points)}
              fill={s.color}
              fillOpacity={s.isBot && botVisibility === 'dim' ? 0.3 : 0.82}
              stroke="#070a12"
              strokeWidth={0.8}
            >
              <title>{`${s.name}: ${s.totalCommits} commits`}</title>
            </path>
          ))}
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={svgH}
            stroke="#f8fafc"
            strokeWidth={2}
          />
        </svg>
      </section>
    </div>
  );
}
