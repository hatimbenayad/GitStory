import { useState } from 'react';
import { buildShareUrl, type BotVisibility, type ViewMode } from '../lib/urlState.js';
import { useStoryStore, type GranularityChoice } from '../store/useStoryStore.js';

const VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: 'replay', label: 'Replay' },
  { id: 'treemap', label: 'Treemap' },
  { id: 'contributors', label: 'Contributors' },
  { id: 'arch', label: 'Architecture' },
];

export function Toolbar({ showExportButton = false }: { showExportButton?: boolean }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const history = useStoryStore((s) => s.history);
  const snapshot = useStoryStore((s) => s.snapshot);
  const view = useStoryStore((s) => s.view);
  const fromCache = useStoryStore((s) => s.fromCache);
  const sharedRepoId = useStoryStore((s) => s.sharedRepoId);
  const reducedMotion = useStoryStore((s) => s.reducedMotion);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);
  const botVisibility = useStoryStore((s) => s.botVisibility);
  const showLabels = useStoryStore((s) => s.showLabels);
  const showCaptions = useStoryStore((s) => s.showCaptions);
  const largeRepoActive = useStoryStore((s) => s.largeRepoActive);
  const granularityChoice = useStoryStore((s) => s.granularityChoice);
  const effectiveGranularity = useStoryStore((s) => s.effectiveGranularity);
  const maxNodes = useStoryStore((s) => s.maxNodes);

  const setView = useStoryStore((s) => s.setView);
  const resetToLanding = useStoryStore((s) => s.resetToLanding);
  const setReducedMotion = useStoryStore((s) => s.setReducedMotion);
  const setColorblindSafe = useStoryStore((s) => s.setColorblindSafe);
  const setBotVisibility = useStoryStore((s) => s.setBotVisibility);
  const setShowLabels = useStoryStore((s) => s.setShowLabels);
  const setShowCaptions = useStoryStore((s) => s.setShowCaptions);
  const setExportModalOpen = useStoryStore((s) => s.setExportModalOpen);
  const setLargeRepoOptions = useStoryStore((s) => s.setLargeRepoOptions);

  if (!history) return null;

  const handleShare = async (): Promise<void> => {
    const shareUrl = buildShareUrl(window.location.href, {
      view,
      idx: snapshot?.eventIndex ?? 0,
      mode: snapshot?.mode ?? 'adaptive',
      cb: colorblindSafe,
      rm: reducedMotion,
      bots: botVisibility,
      ...(sharedRepoId ? { repo: sharedRepoId } : {}),
    });
    window.history.replaceState(null, '', shareUrl);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <div className="repo-title">
          <span className="brand-badge" style={{ width: 26, height: 26, fontSize: '0.78rem' }}>
            GS
          </span>
          <span data-testid="repo-name">{history.repo.name}</span>
          {fromCache && <span className="pill pill-emerald">Cached</span>}
          {largeRepoActive && (
            <span className="pill pill-amber" title={`Aggregated by ${effectiveGranularity}`}>
              Large Repo ({effectiveGranularity})
            </span>
          )}
        </div>
      </div>

      <nav className="toolbar-group" aria-label="Visualization views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`btn ${view === v.id ? 'btn-active' : ''}`}
            data-testid={`view-tab-${v.id}`}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <div className="toolbar-group">
        {showExportButton && (
          <button
            type="button"
            className="btn"
            data-testid="open-export-btn"
            onClick={() => setExportModalOpen(true)}
          >
            Export
          </button>
        )}

        <button type="button" className="btn" onClick={() => void handleShare()}>
          {copied ? 'Link Copied' : 'Share'}
        </button>

        <button
          type="button"
          className="btn"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          Settings
        </button>

        <button type="button" className="btn" onClick={resetToLanding}>
          Load Repo
        </button>
      </div>

      {settingsOpen && (
        <aside className="popover" aria-label="Display and accessibility settings">
          <strong style={{ fontSize: '0.9rem' }}>Display &amp; Accessibility</strong>
          <label>
            <span>Reduced motion</span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
          </label>
          <label>
            <span>Colorblind-safe palette</span>
            <input
              type="checkbox"
              checked={colorblindSafe}
              onChange={(e) => setColorblindSafe(e.target.checked)}
            />
          </label>
          <label>
            <span>Directory labels</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
          </label>
          <label>
            <span>Documentary captions (opt-in)</span>
            <input
              type="checkbox"
              checked={showCaptions}
              onChange={(e) => setShowCaptions(e.target.checked)}
            />
          </label>
          <label>
            <span>Bot commits</span>
            <select
              className="select-input"
              value={botVisibility}
              onChange={(e) => setBotVisibility(e.target.value as BotVisibility)}
            >
              <option value="dim">Dim bots</option>
              <option value="hide">Skip bots</option>
              <option value="show">Show normally</option>
            </select>
          </label>
          <hr style={{ border: 'none', borderTop: '1px solid #24324a', margin: '0.2rem 0' }} />
          <strong style={{ fontSize: '0.85rem' }}>Large-Repo Scaling</strong>
          <label>
            <span>Aggregation</span>
            <select
              className="select-input"
              value={granularityChoice}
              onChange={(e) =>
                setLargeRepoOptions({ granularityChoice: e.target.value as GranularityChoice })
              }
            >
              <option value="auto">Auto</option>
              <option value="commit">Every commit</option>
              <option value="day">By day</option>
              <option value="week">By week</option>
            </select>
          </label>
          <label>
            <span>Node cap</span>
            <select
              className="select-input"
              value={maxNodes}
              onChange={(e) => setLargeRepoOptions({ maxNodes: Number(e.target.value) })}
            >
              <option value={500}>500 nodes</option>
              <option value={1500}>1,500 nodes</option>
              <option value={5000}>5,000 nodes</option>
              <option value={20000}>20,000 nodes</option>
            </select>
          </label>
        </aside>
      )}
    </header>
  );
}
