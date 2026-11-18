import { useEffect, useRef, useState } from 'react';
import { StableTreeLayout, type TreeLayoutFrame } from '@gitstory/layout';
import { ReplayRenderer, type HoverInfo } from '../renderers/ReplayRenderer.js';
import { useStoryStore } from '../store/useStoryStore.js';

export function ReplayView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReplayRenderer | null>(null);
  const layoutRef = useRef<StableTreeLayout>(new StableTreeLayout());
  const lastFrameRef = useRef<TreeLayoutFrame | null>(null);
  const lastEventIdxRef = useRef<number>(-999);
  const fittedRef = useRef(false);
  const draggingRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [ready, setReady] = useState(false);

  const history = useStoryStore((s) => s.history);
  const currentState = useStoryStore((s) => s.currentState);
  const snapshot = useStoryStore((s) => s.snapshot);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);
  const reducedMotion = useStoryStore((s) => s.reducedMotion);
  const showLabels = useStoryStore((s) => s.showLabels);
  const botVisibility = useStoryStore((s) => s.botVisibility);

  // Reset layout anchors whenever a new history is loaded
  useEffect(() => {
    layoutRef.current.reset();
    lastFrameRef.current = null;
    lastEventIdxRef.current = -999;
    fittedRef.current = false;
  }, [history]);

  // Mount PixiJS / Canvas2D renderer
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new ReplayRenderer(host);
    rendererRef.current = renderer;

    let cancelled = false;
    void renderer.init().then(() => {
      if (!cancelled) setReady(true);
    });

    const onResize = () => {
      if (!hostRef.current || !rendererRef.current) return;
      const rect = hostRef.current.getBoundingClientRect();
      rendererRef.current.resize(rect.width, rect.height);
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      setReady(false);
    };
  }, []);

  // Recompute layout on commit change & draw frame
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!ready || !renderer || !currentState || !snapshot) return;

    if (lastEventIdxRef.current !== currentState.eventIndex || !lastFrameRef.current) {
      lastFrameRef.current = layoutRef.current.compute(currentState);
      lastEventIdxRef.current = currentState.eventIndex;
      if (!fittedRef.current && lastFrameRef.current.nodes.length > 1) {
        renderer.fitToBounds(lastFrameRef.current);
        fittedRef.current = true;
      }
    }

    const dimBotCommit =
      botVisibility === 'dim' && Boolean(currentState.activeEvent?.isBot);

    renderer.render(lastFrameRef.current, snapshot.eventProgress, {
      colorblindSafe,
      reducedMotion,
      showLabels,
      dimBotCommit,
    });
  }, [
    ready,
    currentState,
    snapshot,
    colorblindSafe,
    reducedMotion,
    showLabels,
    botVisibility,
  ]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    const renderer = rendererRef.current;
    if (!renderer || !lastFrameRef.current || !snapshot) return;
    const cam = renderer.getCamera();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextScale = Math.max(0.15, Math.min(4, cam.scale * factor));
    renderer.setCamera({ ...cam, scale: nextScale });
    renderer.render(lastFrameRef.current, snapshot.eventProgress, {
      colorblindSafe,
      reducedMotion,
      showLabels,
      dimBotCommit: botVisibility === 'dim' && Boolean(currentState?.activeEvent?.isBot),
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    draggingRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (draggingRef.current.active && lastFrameRef.current && snapshot) {
      const dx = e.clientX - draggingRef.current.lastX;
      const dy = e.clientY - draggingRef.current.lastY;
      draggingRef.current.lastX = e.clientX;
      draggingRef.current.lastY = e.clientY;
      const cam = renderer.getCamera();
      renderer.setCamera({ ...cam, x: cam.x + dx, y: cam.y + dy });
      renderer.render(lastFrameRef.current, snapshot.eventProgress, {
        colorblindSafe,
        reducedMotion,
        showLabels,
        dimBotCommit: botVisibility === 'dim' && Boolean(currentState?.activeEvent?.isBot),
      });
      return;
    }

    setHover(renderer.hitTest(e.clientX, e.clientY));
  };

  const handlePointerUp = (): void => {
    draggingRef.current.active = false;
  };

  const handleFit = (): void => {
    const renderer = rendererRef.current;
    if (!renderer || !lastFrameRef.current || !snapshot) return;
    renderer.fitToBounds(lastFrameRef.current);
    renderer.render(lastFrameRef.current, snapshot.eventProgress, {
      colorblindSafe,
      reducedMotion,
      showLabels,
      dimBotCommit: botVisibility === 'dim' && Boolean(currentState?.activeEvent?.isBot),
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        ref={hostRef}
        className="canvas-host"
        data-testid="replay-canvas-host"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          draggingRef.current.active = false;
          setHover(null);
        }}
      />

      <button
        type="button"
        className="btn"
        style={{ position: 'absolute', bottom: '1rem', right: '1rem', zIndex: 12 }}
        onClick={handleFit}
        aria-label="Reset camera zoom to fit tree"
      >
        Fit View
      </button>

      {hover && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover.screenX + 14, window.innerWidth - 320),
            top: Math.max(12, hover.screenY - 12),
          }}
        >
          <div style={{ fontWeight: 600 }}>{hover.node.path || '/'}</div>
          <div style={{ color: '#94a3b8' }}>
            {hover.node.kind === 'dir' ? 'Directory' : `${hover.node.lines.toLocaleString()} lines`}
          </div>
        </div>
      )}
    </div>
  );
}
