import type { PacingMode } from '@gitstory/timeline';

export type ViewMode = 'replay' | 'treemap' | 'contributors' | 'arch';
export type BotVisibility = 'show' | 'dim' | 'hide';

export interface ShareableUrlState {
  view?: ViewMode;
  idx?: number;
  mode?: PacingMode;
  cb?: boolean;
  rm?: boolean;
  bots?: BotVisibility;
  repo?: string;
}

const VALID_VIEWS = new Set<ViewMode>(['replay', 'treemap', 'contributors', 'arch']);
const VALID_BOTS = new Set<BotVisibility>(['show', 'dim', 'hide']);

/**
 * Parses shareable URL query parameters (`FR-27`).
 */
export function parseUrlState(search: string): ShareableUrlState {
  const params = new URLSearchParams(search);
  const out: ShareableUrlState = {};

  const view = params.get('view');
  if (view && VALID_VIEWS.has(view as ViewMode)) {
    out.view = view as ViewMode;
  }

  const idxRaw = params.get('idx');
  if (idxRaw !== null) {
    const idx = Number.parseInt(idxRaw, 10);
    if (Number.isFinite(idx) && idx >= 0) out.idx = idx;
  }

  const mode = params.get('mode');
  if (mode === 'adaptive' || mode === 'constant') {
    out.mode = mode;
  }

  if (params.get('cb') === '1') out.cb = true;
  if (params.get('rm') === '1') out.rm = true;

  const bots = params.get('bots');
  if (bots && VALID_BOTS.has(bots as BotVisibility)) {
    out.bots = bots as BotVisibility;
  }

  const repo = params.get('repo');
  if (repo && /^[A-Za-z0-9_.-]+$/.test(repo)) {
    out.repo = repo;
  }

  return out;
}

/**
 * Serializes current UI state into a shareable permalink query string (`FR-27`).
 */
export function buildShareUrl(baseUrl: string, state: ShareableUrlState): string {
  const url = new URL(baseUrl);
  const params = url.searchParams;
  if (state.view) params.set('view', state.view);
  if (state.idx !== undefined && state.idx >= 0) params.set('idx', String(state.idx));
  if (state.mode) params.set('mode', state.mode);
  if (state.cb) params.set('cb', '1');
  else params.delete('cb');
  if (state.rm) params.set('rm', '1');
  else params.delete('rm');
  if (state.bots && state.bots !== 'dim') params.set('bots', state.bots);
  else params.delete('bots');
  if (state.repo) params.set('repo', state.repo);
  return url.toString();
}
