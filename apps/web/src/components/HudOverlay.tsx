import { useStoryStore } from '../store/useStoryStore.js';

function formatDate(unixSec: number): string {
  if (!unixSec) return '—';
  return new Date(unixSec * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function HudOverlay() {
  const history = useStoryStore((s) => s.history);
  const currentState = useStoryStore((s) => s.currentState);
  const snapshot = useStoryStore((s) => s.snapshot);
  const showCaptions = useStoryStore((s) => s.showCaptions);
  const narration = useStoryStore((s) => s.narration);

  if (!history || !currentState || !snapshot) return null;

  const ev = currentState.activeEvent;
  const authorInfo = ev ? history.authors[ev.author] : undefined;
  const authorLabel = authorInfo?.name ?? ev?.author ?? '—';

  const activeCaption = showCaptions
    ? narration.find((seg) => Math.abs(seg.eventIndex - snapshot.eventIndex) <= 1)
    : undefined;

  return (
    <>
      <section className="hud-top-left" aria-label="Current commit details" data-testid="hud-overlay">
        <div className="hud-date-row">
          <span data-testid="hud-date">{formatDate(ev?.t ?? 0)}</span>
          <span>•</span>
          <span data-testid="hud-commit-counter">
            {history.events.length === 0
              ? '0 / 0'
              : `${snapshot.eventIndex + 1} / ${history.events.length}`}
          </span>
          {snapshot.activeChapter && (
            <span className="pill pill-amber" data-testid="hud-chapter">
              {snapshot.activeChapter.name}
            </span>
          )}
        </div>
        <p className="hud-message" title={ev?.message ?? 'Empty repository'} data-testid="hud-message">
          {ev?.message ?? 'No commits in repository'}
        </p>
        <div className="hud-author">
          <span>{authorLabel}</span>
          {ev?.isBot && <span className="pill">BOT</span>}
          {ev && (
            <span style={{ opacity: 0.7 }}>
              ({ev.hash.slice(0, 7)} · {ev.changes.length} file{ev.changes.length === 1 ? '' : 's'})
            </span>
          )}
        </div>
      </section>

      <section className="hud-stats" aria-label="Running repository statistics">
        <div className="stat-box">
          <div className="stat-label">Files</div>
          <div className="stat-value" data-testid="stat-files">
            {currentState.totalFiles.toLocaleString()}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Lines</div>
          <div className="stat-value" data-testid="stat-lines">
            {currentState.totalLines.toLocaleString()}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Authors</div>
          <div className="stat-value" data-testid="stat-authors">
            {currentState.uniqueAuthors.size.toLocaleString()}
          </div>
        </div>
      </section>

      {activeCaption && (
        <div className="caption-bar" role="status" aria-live="polite">
          <strong>{activeCaption.title}: </strong>
          {activeCaption.text}
        </div>
      )}

      {snapshot.activeHighlight && (
        <div className="highlight-toast" role="status" data-testid="highlight-toast">
          <span className="pill pill-amber">Highlight</span>
          <strong>{snapshot.activeHighlight.title}</strong>
          <span style={{ color: '#94a3b8' }}>{snapshot.activeHighlight.detail}</span>
        </div>
      )}
    </>
  );
}
