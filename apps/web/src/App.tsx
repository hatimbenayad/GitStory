import { useEffect } from 'react';
import { HudOverlay } from './components/HudOverlay.js';
import { LandingView } from './components/LandingView.js';
import { ReplayView } from './components/ReplayView.js';
import { TimelineBar } from './components/TimelineBar.js';
import { Toolbar } from './components/Toolbar.js';
import { useStoryStore } from './store/useStoryStore.js';

export function App() {
  const history = useStoryStore((s) => s.history);
  const view = useStoryStore((s) => s.view);
  const playing = useStoryStore((s) => s.snapshot?.playing ?? false);
  const loadHistoryObject = useStoryStore((s) => s.loadHistoryObject);
  const tick = useStoryStore((s) => s.tick);

  // Auto-preload `/api/history.json` when launched via `gitstory serve` (FR-2)
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/history.json')
      .then(async (res) => {
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) return;
        const data: unknown = await res.json();
        if (!cancelled) {
          loadHistoryObject(data);
        }
      })
      .catch(() => {
        // Standalone static web app without CLI server — show landing screen
      });
    return () => {
      cancelled = true;
    };
  }, [loadHistoryObject]);

  // Virtual clock animation loop
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let lastTs = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(100, now - lastTs);
      lastTs = now;
      tick(dt);
      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing, tick]);

  if (!history) {
    return (
      <LandingView
        onLoadRawJson={(raw, meta) => {
          loadHistoryObject(raw, meta);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Toolbar />
      <main className="stage-wrapper">
        {view === 'replay' && <ReplayView />}
        {view !== 'replay' && (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: '#94a3b8',
            }}
          >
            {view} view coming in next Bolt
          </div>
        )}
        <HudOverlay />
      </main>
      <TimelineBar />
    </div>
  );
}
