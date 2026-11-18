import { useEffect } from 'react';
import type { PacingMode } from '@gitstory/timeline';
import { useStoryStore } from '../store/useStoryStore.js';

const SPEEDS = [0.5, 1, 2, 4, 8];

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function TimelineBar() {
  const history = useStoryStore((s) => s.history);
  const timeline = useStoryStore((s) => s.timeline);
  const snapshot = useStoryStore((s) => s.snapshot);
  const chapters = useStoryStore((s) => s.chapters);
  const togglePlay = useStoryStore((s) => s.togglePlay);
  const stepIndex = useStoryStore((s) => s.stepIndex);
  const seekToProgress = useStoryStore((s) => s.seekToProgress);
  const seekToIndex = useStoryStore((s) => s.seekToIndex);
  const jumpToChapter = useStoryStore((s) => s.jumpToChapter);
  const nextChapter = useStoryStore((s) => s.nextChapter);
  const prevChapter = useStoryStore((s) => s.prevChapter);
  const setSpeed = useStoryStore((s) => s.setSpeed);
  const setPacingMode = useStoryStore((s) => s.setPacingMode);

  // Global keyboard shortcuts (FR-20)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepIndex(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepIndex(-1);
      } else if (e.key === ']') {
        e.preventDefault();
        nextChapter();
      } else if (e.key === '[') {
        e.preventDefault();
        prevChapter();
      } else if (e.key === 'Home' || e.key === '0') {
        e.preventDefault();
        seekToIndex(0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, stepIndex, nextChapter, prevChapter, seekToIndex]);

  if (!history || !timeline || !snapshot) return null;

  const chapterPositions = timeline.getChapterPositions();

  return (
    <footer className="timeline-bar" aria-label="Playback timeline controls">
      <div className="scrubber-wrap">
        {chapterPositions.map(({ chapter, progress }, idx) => (
          <button
            key={`${chapter.name}-${idx}`}
            type="button"
            className="chapter-marker"
            style={{ left: `${progress * 100}%` }}
            title={`Jump to chapter ${chapter.name}`}
            onClick={() => jumpToChapter(idx)}
          >
            {chapter.name}
          </button>
        ))}

        <input
          type="range"
          className="scrubber-input"
          data-testid="timeline-scrubber"
          aria-label="Timeline scrubber"
          min={0}
          max={1000}
          step={1}
          value={Math.round(snapshot.progress * 1000)}
          onChange={(e) => seekToProgress(Number(e.target.value) / 1000)}
        />
      </div>

      <div className="controls-row">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="play-pause-btn"
            aria-label={snapshot.playing ? 'Pause replay' : 'Play replay'}
            onClick={togglePlay}
          >
            {snapshot.playing ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            className="btn"
            aria-label="Previous commit"
            onClick={() => stepIndex(-1)}
          >
            &lsaquo; Step
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Next commit"
            onClick={() => stepIndex(1)}
          >
            Step &rsaquo;
          </button>

          {chapters.length > 0 && (
            <>
              <button
                type="button"
                className="btn"
                aria-label="Previous chapter"
                onClick={prevChapter}
              >
                &laquo; Ch
              </button>
              <button
                type="button"
                className="btn"
                aria-label="Next chapter"
                onClick={nextChapter}
              >
                Ch &raquo;
              </button>
            </>
          )}

          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
            {formatSeconds(snapshot.currentTimeSec)} / {formatSeconds(snapshot.totalDurationSec)}
          </span>
        </div>

        <div className="toolbar-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
            <span>Speed</span>
            <select
              className="select-input"
              aria-label="Playback speed"
              value={snapshot.speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}x
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
            <span>Pacing</span>
            <select
              className="select-input"
              aria-label="Timeline pacing mode"
              value={snapshot.mode}
              onChange={(e) => setPacingMode(e.target.value as PacingMode)}
            >
              <option value="adaptive">Adaptive</option>
              <option value="constant">Constant</option>
            </select>
          </label>
        </div>
      </div>
    </footer>
  );
}
