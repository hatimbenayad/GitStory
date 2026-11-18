import { useMemo, useRef, useState } from 'react';
import { getTopLevelDir, type RepoState } from '@gitstory/core';
import {
  diffArchGraphs,
  layoutArchDiff,
  type ArchDiff,
  type ArchGraph,
  type DiffStatus,
} from '@gitstory/layout';
import { useStoryStore } from '../store/useStoryStore.js';

type ArchDisplayMode = 'overlay' | 'side-by-side';

function statusColor(status: DiffStatus, colorblindSafe: boolean): string {
  if (status === 'added') return colorblindSafe ? '#009E73' : '#34d399';
  if (status === 'removed') return colorblindSafe ? '#D55E00' : '#fb7185';
  if (status === 'changed') return colorblindSafe ? '#E69F00' : '#fbbf24';
  return '#64748b';
}

function statusPrefix(status: DiffStatus): string {
  if (status === 'added') return '+';
  if (status === 'removed') return '-';
  if (status === 'changed') return '~';
  return '';
}

/**
 * Derives a structural module-directory graph from any `RepoState` snapshot when
 * source-level `arch-diff.json` (from `gitstory arch`) has not been uploaded.
 */
function buildHistoryRefGraph(refLabel: string, state: RepoState): ArchGraph {
  const dirs = new Map<string, { files: number; lines: number }>();
  for (const f of state.files.values()) {
    const group = f.dir || 'root';
    const cur = dirs.get(group) ?? { files: 0, lines: 0 };
    cur.files += 1;
    cur.lines += f.lines;
    dirs.set(group, cur);
  }

  const nodes = [...dirs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 32)
    .map(([dirPath, info]) => {
      const top = getTopLevelDir(dirPath) || dirPath;
      return {
        id: dirPath,
        label: dirPath,
        group: top,
        language: 'ts' as const,
        imports: dirPath.includes('/') ? [dirPath.slice(0, dirPath.lastIndexOf('/'))] : [],
        externalImports: [`files:${info.files}`, `lines:${Math.round(info.lines / 50) * 50}`],
        lines: info.lines,
      };
    });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [];
  for (const n of nodes) {
    for (const imp of n.imports) {
      if (nodeIds.has(imp)) {
        edges.push({ from: n.id, to: imp });
      }
    }
  }

  return { ref: refLabel, nodes, edges };
}

function GraphCanvas({
  diff,
  filter,
  colorblindSafe,
  title,
}: {
  diff: ArchDiff;
  filter: 'all' | 'refA' | 'refB';
  colorblindSafe: boolean;
  title?: string;
}) {
  const width = 620;
  const height = 420;
  const laidOut = useMemo(() => layoutArchDiff(diff, width, height), [diff]);

  const visibleNodes = laidOut.nodes.filter((n) => {
    if (filter === 'refA') return n.status !== 'added';
    if (filter === 'refB') return n.status !== 'removed';
    return true;
  });
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = laidOut.edges.filter((e) => {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return false;
    if (filter === 'refA') return e.status !== 'added';
    if (filter === 'refB') return e.status !== 'removed';
    return true;
  });

  return (
    <div
      style={{
        flex: 1,
        minWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #24324a',
        borderRadius: 12,
        background: '#0b1020',
        overflow: 'hidden',
      }}
    >
      {title && (
        <div
          style={{
            padding: '0.5rem 0.85rem',
            borderBottom: '1px solid #24324a',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#cbd5e1',
          }}
        >
          {title}
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', flex: 1 }}>
        <defs>
          <marker
            id="arch-arrow"
            viewBox="0 0 10 10"
            refX="18"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#94a3b8" />
          </marker>
        </defs>

        {visibleEdges.map((e, i) => {
          const color = statusColor(e.status, colorblindSafe);
          return (
            <line
              key={`${e.from}-${e.to}-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={color}
              strokeOpacity={e.status === 'unchanged' ? 0.35 : 0.85}
              strokeWidth={e.status === 'unchanged' ? 1.2 : 2}
              strokeDasharray={e.status === 'removed' ? '5 4' : undefined}
              markerEnd="url(#arch-arrow)"
            />
          );
        })}

        {visibleNodes.map((n) => {
          const color = statusColor(n.status, colorblindSafe);
          const r = Math.max(8, Math.min(18, 6 + Math.log2(1 + n.lines) * 1.1));
          return (
            <g key={n.id}>
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={color}
                fillOpacity={n.status === 'unchanged' ? 0.65 : 0.92}
                stroke="#070a12"
                strokeWidth={2}
              >
                <title>{`${n.id} (${n.status}, ${n.lines} lines)`}</title>
              </circle>
              <text
                x={n.x}
                y={n.y + r + 13}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize="10"
                fontWeight="600"
              >
                {statusPrefix(n.status)}
                {n.label.slice(0, 22)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ArchDiffView() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const history = useStoryStore((s) => s.history);
  const replayEngine = useStoryStore((s) => s.replayEngine);
  const chapters = useStoryStore((s) => s.chapters);
  const colorblindSafe = useStoryStore((s) => s.colorblindSafe);

  const [displayMode, setDisplayMode] = useState<ArchDisplayMode>('overlay');
  const [uploadedDiff, setUploadedDiff] = useState<ArchDiff | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const refOptions = useMemo(() => {
    if (!history || history.events.length === 0) return [];
    const opts: Array<{ label: string; eventIndex: number }> = [];
    opts.push({
      label: `Start (${history.events[0]!.hash.slice(0, 7)})`,
      eventIndex: 0,
    });
    for (const ch of chapters) {
      opts.push({ label: `Tag ${ch.name}`, eventIndex: ch.eventIndex });
    }
    const lastIdx = history.events.length - 1;
    if (!opts.some((o) => o.eventIndex === lastIdx)) {
      opts.push({
        label: `HEAD (${history.events[lastIdx]!.hash.slice(0, 7)})`,
        eventIndex: lastIdx,
      });
    }
    return opts;
  }, [history, chapters]);

  const [refAIndex, setRefAIndex] = useState<number>(0);
  const [refBIndex, setRefBIndex] = useState<number>(() =>
    Math.max(0, (history?.events.length ?? 1) - 1),
  );

  const derivedDiff = useMemo<ArchDiff | null>(() => {
    if (uploadedDiff) return uploadedDiff;
    if (!history || !replayEngine || history.events.length === 0) return null;
    const idxA = Math.min(refAIndex, history.events.length - 1);
    const idxB = Math.min(refBIndex, history.events.length - 1);
    const labelA =
      refOptions.find((o) => o.eventIndex === idxA)?.label ??
      history.events[idxA]!.hash.slice(0, 7);
    const labelB =
      refOptions.find((o) => o.eventIndex === idxB)?.label ??
      history.events[idxB]!.hash.slice(0, 7);

    const gA = buildHistoryRefGraph(labelA, replayEngine.getStateAt(idxA));
    const gB = buildHistoryRefGraph(labelB, replayEngine.getStateAt(idxB));
    return diffArchGraphs(gA, gB);
  }, [uploadedDiff, history, replayEngine, refAIndex, refBIndex, refOptions]);

  const handleUploadArchDiff = async (file: File) => {
    setUploadError(null);
    try {
      const parsed = JSON.parse(await file.text()) as ArchDiff;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !parsed.summary) {
        throw new Error('File does not match ArchDiff format (generate via `gitstory arch`)');
      }
      setUploadedDiff(parsed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Invalid arch-diff.json');
    }
  };

  if (!derivedDiff) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8' }}>
        Load a repository with commits to compare architecture between two refs.
      </div>
    );
  }

  return (
    <div
      data-testid="arch-diff-view"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        gap: '0.75rem',
        background: '#070a12',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.6rem',
          background: '#0f1624',
          border: '1px solid #24324a',
          borderRadius: 10,
          padding: '0.65rem 0.9rem',
        }}
      >
        <div className="toolbar-group">
          <strong style={{ fontSize: '0.9rem' }}>Architecture Diff</strong>
          {!uploadedDiff && (
            <>
              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>From</span>
                <select
                  className="select-input"
                  value={refAIndex}
                  onChange={(e) => setRefAIndex(Number(e.target.value))}
                >
                  {refOptions.map((o) => (
                    <option key={`a-${o.label}-${o.eventIndex}`} value={o.eventIndex}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>To</span>
                <select
                  className="select-input"
                  value={refBIndex}
                  onChange={(e) => setRefBIndex(Number(e.target.value))}
                >
                  {refOptions.map((o) => (
                    <option key={`b-${o.label}-${o.eventIndex}`} value={o.eventIndex}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {uploadedDiff && (
            <button type="button" className="btn" onClick={() => setUploadedDiff(null)}>
              Reset to History Refs
            </button>
          )}
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className={`btn ${displayMode === 'overlay' ? 'btn-active' : ''}`}
            onClick={() => setDisplayMode('overlay')}
          >
            Diff Overlay
          </button>
          <button
            type="button"
            className={`btn ${displayMode === 'side-by-side' ? 'btn-active' : ''}`}
            onClick={() => setDisplayMode('side-by-side')}
          >
            Side-by-Side
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            title="Load AST import graph diff generated by `gitstory arch <path> <refA> <refB>`"
          >
            Load arch-diff.json
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadArchDiff(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {uploadError && (
        <div className="error-banner" role="alert">
          {uploadError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
        <span className="pill pill-emerald">+{derivedDiff.summary.addedNodes} Added</span>
        <span
          className="pill"
          style={{
            background: 'rgba(251, 113, 133, 0.14)',
            color: '#fb7185',
            borderColor: 'rgba(251, 113, 133, 0.35)',
          }}
        >
          -{derivedDiff.summary.removedNodes} Removed
        </span>
        <span className="pill pill-amber">~{derivedDiff.summary.changedNodes} Changed</span>
        <span style={{ color: '#94a3b8' }}>
          Edges: +{derivedDiff.summary.addedEdges} / -{derivedDiff.summary.removedEdges} · Comparing{' '}
          <strong>{derivedDiff.refA}</strong> &rarr; <strong>{derivedDiff.refB}</strong>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 340, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {displayMode === 'overlay' ? (
          <GraphCanvas
            diff={derivedDiff}
            filter="all"
            colorblindSafe={colorblindSafe}
            title={`Diff Overlay: ${derivedDiff.refA} → ${derivedDiff.refB}`}
          />
        ) : (
          <>
            <GraphCanvas
              diff={derivedDiff}
              filter="refA"
              colorblindSafe={colorblindSafe}
              title={`Before: ${derivedDiff.refA}`}
            />
            <GraphCanvas
              diff={derivedDiff}
              filter="refB"
              colorblindSafe={colorblindSafe}
              title={`After: ${derivedDiff.refB}`}
            />
          </>
        )}
      </div>
    </div>
  );
}
