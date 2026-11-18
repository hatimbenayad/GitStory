import { useCallback, useEffect } from 'react';
import { ArchDiffView } from './components/ArchDiffView.js';
import { ContributorView } from './components/ContributorView.js';
import { ExportModal } from './components/ExportModal.js';
import { HudOverlay } from './components/HudOverlay.js';
import { LandingView } from './components/LandingView.js';
import { ReplayView } from './components/ReplayView.js';
import { TimelineBar } from './components/TimelineBar.js';
import { Toolbar } from './components/Toolbar.js';
import { TreemapView } from './components/TreemapView.js';
import { processHistoryAsync } from './lib/historyProcessor.js';
import { parseUrlState } from './lib/urlState.js';
import { useStoryStore } from './store/useStoryStore.js';

export function App() {
  const history = useStoryStore((s) => s.history);
  const view = useStoryStore((s) => s.view);
  const playing = useStoryStore((s) => s.snapshot?.playing ?? false);
  const loadHistoryObject = useStoryStore((s) => s.loadHistoryObject);
  const setLoading = useStoryStore((s) => s.setLoading);
  const setError = useStoryStore((s) => s.setError);
  const tick = useStoryStore((s) => s.tick);

  const handleLoadRaw = useCallback(
    async (raw: unknown, meta?: { sharedRepoId?: string | null }) => {
      setLoading(true, 'Analyzing commits & highlights in background worker...');
      try {
        const result = await processHistoryAsync(raw);
        loadHistoryObject(result.history, {
          fromCache: result.fromCache,
          chapters: result.chapters,
          highlights: result.highlights,
          sharedRepoId: meta?.sharedRepoId ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadHistoryObject, setError, setLoading],
  );

  const handleLoadGitHubUrl = useCallback(
    async (url: string, apiBase: string) => {
      const base = apiBase.replace(/\/+$/, '');
      setLoading(true, 'Cloning public repo via optional backend (--filter=blob:none)...');
      try {
        const res = await fetch(`${base}/api/repos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, firstParent: true }),
        });
        const body = (await res.json()) as { id?: string; history?: unknown; error?: string };
        if (!res.ok || !body.history) {
          throw new Error(body.error ?? `Backend returned HTTP ${res.status}`);
        }
        await handleLoadRaw(body.history, { sharedRepoId: body.id ?? null });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [handleLoadRaw, setError, setLoading],
  );

  // Auto-preload `/api/history.json` (CLI serve) or `?repo=<id>` (optional backend)
  useEffect(() => {
    let cancelled = false;
    const urlState = parseUrlState(window.location.search);
    const apiBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(
      /\/+$/,
      '',
    );

    if (urlState.repo && apiBase) {
      void fetch(`${apiBase}/api/repos/${encodeURIComponent(urlState.repo)}/history`)
        .then(async (res) => {
          if (!res.ok) return;
          const data: unknown = await res.json();
          if (!cancelled) {
            await handleLoadRaw(data, { sharedRepoId: urlState.repo ?? null });
          }
        })
        .catch(() => {
          // ignore offline backend
        });
      return () => {
        cancelled = true;
      };
    }

    void fetch('/api/history.json')
      .then(async (res) => {
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) return;
        const data: unknown = await res.json();
        if (!cancelled) {
          await handleLoadRaw(data);
        }
      })
      .catch(() => {
        // Standalone static web app without CLI server — show landing screen
      });
    return () => {
      cancelled = true;
    };
  }, [handleLoadRaw]);

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
      <LandingView onLoadRawJson={handleLoadRaw} onLoadGitHubUrl={handleLoadGitHubUrl} />
    );
  }

  return (
    <div className="app-shell">
      <Toolbar showExportButton />
      <main className="stage-wrapper">
        {view === 'replay' && <ReplayView />}
        {view === 'treemap' && <TreemapView />}
        {view === 'contributors' && <ContributorView />}
        {view === 'arch' && <ArchDiffView />}
        {view !== 'arch' && <HudOverlay />}
      </main>
      <TimelineBar />
      <ExportModal />
    </div>
  );
}
