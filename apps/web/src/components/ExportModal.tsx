import { useRef, useState } from 'react';
import { collapseRepoState } from '@gitstory/core';
import {
  ExportCancelledError,
  exportAnimation,
  getExportCapabilities,
  type ExportFormat,
  type ExportProgress,
} from '@gitstory/exporter';
import { StableTreeLayout } from '@gitstory/layout';
import { drawTreeFrameToCanvas2D } from '../renderers/ReplayRenderer.js';
import { useStoryStore } from '../store/useStoryStore.js';

const PRESETS = [
  { id: 'compact', label: 'Compact (640 × 360)', width: 640, height: 360 },
  { id: 'hd', label: 'HD 720p (1280 × 720)', width: 1280, height: 720 },
  { id: 'fhd', label: 'Full HD 1080p (1920 × 1080)', width: 1920, height: 1080 },
] as const;

export function ExportModal() {
  const open = useStoryStore((s) => s.exportModalOpen);
  const setOpen = useStoryStore((s) => s.setExportModalOpen);
  const history = useStoryStore((s) => s.history);
  const replayEngine = useStoryStore((s) => s.replayEngine);
  const timeline = useStoryStore((s) => s.timeline);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);
  const reducedMotion = useStoryStore((s) => s.reducedMotion);
  const showLabels = useStoryStore((s) => s.showLabels);
  const maxDepth = useStoryStore((s) => s.maxDepth);
  const maxNodes = useStoryStore((s) => s.maxNodes);

  const caps = getExportCapabilities();
  const [format, setFormat] = useState<ExportFormat>(caps.webCodecsMp4 ? 'mp4' : 'gif');
  const [presetId, setPresetId] = useState<string>('compact');
  const [durationSec, setDurationSec] = useState<number>(6);
  const [fps, setFps] = useState<number>(12);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!open || !history || !replayEngine || !timeline) return null;

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  const handleStart = async (): Promise<void> => {
    setErrorMsg(null);
    setStatusMsg(null);
    setExporting(true);
    setProgress({ frame: 0, totalFrames: Math.round(durationSec * fps), percent: 0, stage: 'rendering' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = preset.width;
      canvas.height = preset.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not acquire 2D rendering context for export');

      const layout = new StableTreeLayout();
      const totalTimelineSec = Math.max(0.1, timeline.getSnapshot().totalDurationSec);

      // Precompute final frame bounds for rock-steady framing across entire clip
      const finalState = collapseRepoState(
        replayEngine.getStateAt(Math.max(0, history.events.length - 1)),
        { maxDepth, maxNodes },
      );
      const finalFrame = layout.compute(finalState);
      layout.reset();

      const pad = 70;
      const spanX = Math.max(220, finalFrame.bounds.maxX - finalFrame.bounds.minX + pad * 2);
      const spanY = Math.max(220, finalFrame.bounds.maxY - finalFrame.bounds.minY + pad * 2);
      const scale = Math.max(
        0.18,
        Math.min(1.5, Math.min(preset.width / spanX, (preset.height - 90) / spanY)),
      );
      const cx = (finalFrame.bounds.minX + finalFrame.bounds.maxX) / 2;
      const cy = (finalFrame.bounds.minY + finalFrame.bounds.maxY) / 2;
      const camera = { x: -cx * scale, y: -cy * scale + 20, scale };

      let lastIdx = -999;
      let cachedTreeFrame = finalFrame;

      const blob = await exportAnimation(
        (timeSec) => {
          const frac = durationSec > 0 ? timeSec / durationSec : 1;
          const snap = timeline.sampleAtTime(frac * totalTimelineSec);
          const state = collapseRepoState(replayEngine.getStateAt(snap.eventIndex), {
            maxDepth,
            maxNodes,
          });
          if (snap.eventIndex !== lastIdx) {
            cachedTreeFrame = layout.compute(state);
            lastIdx = snap.eventIndex;
          }

          drawTreeFrameToCanvas2D(
            ctx,
            preset.width,
            preset.height,
            cachedTreeFrame,
            snap.eventProgress,
            camera,
            {
              colorblindSafe,
              reducedMotion,
              showLabels,
              dimBotCommit: Boolean(state.activeEvent?.isBot),
            },
          );

          // Draw crisp documentary HUD burn-in onto exported frame
          ctx.save();
          ctx.fillStyle = 'rgba(7, 10, 18, 0.78)';
          ctx.fillRect(14, 14, Math.min(preset.width - 28, 390), 58);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(14.5, 14.5, Math.min(preset.width - 28, 390), 58);

          const ev = state.activeEvent;
          const dateStr = ev?.t ? new Date(ev.t * 1000).toISOString().slice(0, 10) : '';
          ctx.fillStyle = '#38bdf8';
          ctx.font = '700 13px system-ui, sans-serif';
          ctx.fillText(
            `${history.repo.name}  •  ${dateStr}${snap.activeChapter ? `  [${snap.activeChapter.name}]` : ''}`,
            24,
            34,
          );
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '500 12px system-ui, sans-serif';
          const msg = (ev?.message ?? '').slice(0, 52);
          ctx.fillText(msg, 24, 52);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.fillText(
            `${state.totalFiles} files · ${state.totalLines.toLocaleString()} lines · ${state.uniqueAuthors.size} authors`,
            24,
            66,
          );
          ctx.restore();

          return { kind: 'canvas', canvas };
        },
        {
          format,
          width: preset.width,
          height: preset.height,
          fps,
          durationSec,
          signal: controller.signal,
          onProgress: (p) => setProgress(p),
        },
      );

      const safeName = history.repo.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
      const filename = `${safeName}-gitstory.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatusMsg(`Exported ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      if (err instanceof ExportCancelledError) {
        setStatusMsg('Export cancelled.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = (): void => {
    abortRef.current?.abort();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Export animation">
      <div className="modal-card" data-testid="export-modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Export Documentary Clip</h2>
          <button
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>

        <label className="field-row">
          <span>Format</span>
          <select
            className="select-input"
            data-testid="export-format-select"
            disabled={exporting}
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            <option value="mp4" disabled={!caps.webCodecsMp4}>
              MP4 (H.264 WebCodecs{caps.webCodecsMp4 ? '' : ' — unavailable in this browser'})
            </option>
            <option value="gif">GIF (Animated GIF89a — universal)</option>
          </select>
        </label>

        <label className="field-row">
          <span>Resolution</span>
          <select
            className="select-input"
            disabled={exporting}
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label className="field-row">
            <span>Duration (sec)</span>
            <input
              type="number"
              className="text-input"
              min={1}
              max={60}
              disabled={exporting}
              value={durationSec}
              onChange={(e) => setDurationSec(Math.max(1, Math.min(60, Number(e.target.value) || 5)))}
            />
          </label>

          <label className="field-row">
            <span>Frame Rate (FPS)</span>
            <input
              type="number"
              className="text-input"
              min={4}
              max={format === 'gif' ? 20 : 60}
              disabled={exporting}
              value={fps}
              onChange={(e) => setFps(Math.max(4, Math.min(60, Number(e.target.value) || 12)))}
            />
          </label>
        </div>

        {progress && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span>
                {progress.stage} ({progress.frame}/{progress.totalFrames} frames)
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {statusMsg && (
          <div
            data-testid="export-status"
            style={{ fontSize: '0.84rem', color: '#34d399' }}
          >
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="error-banner" role="alert">
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          {exporting ? (
            <button type="button" className="btn" onClick={handleCancel}>
              Cancel Export
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="start-export-btn"
              onClick={() => void handleStart()}
            >
              Export {format.toUpperCase()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
