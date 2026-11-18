import { create } from 'zustand';
import {
  ReplayEngine,
  TemplateNarrationProvider,
  buildChapters,
  detectHighlights,
  validateHistory,
  type Chapter,
  type Highlight,
  type History,
  type NarrationSegment,
  type RepoState,
} from '@gitstory/core';
import { TimelineEngine, type PacingMode, type TimelineSnapshot } from '@gitstory/timeline';
import { parseUrlState, type BotVisibility, type ViewMode } from '../lib/urlState.js';

export interface StoryStoreState {
  history: History | null;
  replayEngine: ReplayEngine | null;
  timeline: TimelineEngine | null;
  snapshot: TimelineSnapshot | null;
  currentState: RepoState | null;
  chapters: Chapter[];
  highlights: Highlight[];
  narration: NarrationSegment[];

  // UI state
  view: ViewMode;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  fromCache: boolean;
  sharedRepoId: string | null;

  // Accessibility & visual settings
  reducedMotion: boolean;
  colorblindSafe: boolean;
  botVisibility: BotVisibility;
  showLabels: boolean;
  showCaptions: boolean;
  exportModalOpen: boolean;

  // Actions
  loadHistoryObject: (
    raw: unknown,
    meta?: {
      fromCache?: boolean;
      sharedRepoId?: string | null;
      chapters?: Chapter[];
      highlights?: Highlight[];
      narration?: NarrationSegment[];
    },
  ) => boolean;
  resetToLanding: () => void;
  setView: (view: ViewMode) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setReducedMotion: (v: boolean) => void;
  setColorblindSafe: (v: boolean) => void;
  setBotVisibility: (v: BotVisibility) => void;
  setShowLabels: (v: boolean) => void;
  setShowCaptions: (v: boolean) => void;
  setExportModalOpen: (v: boolean) => void;

  // Timeline proxies
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  tick: (dtMs: number) => void;
  seekToProgress: (p: number) => void;
  seekToIndex: (idx: number) => void;
  stepIndex: (delta: number) => void;
  jumpToChapter: (idx: number) => void;
  nextChapter: () => void;
  prevChapter: () => void;
  setSpeed: (speed: number) => void;
  setPacingMode: (mode: PacingMode) => void;
}

const defaultNarrator = new TemplateNarrationProvider();

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const initialUrl =
  typeof window !== 'undefined' ? parseUrlState(window.location.search) : {};

export const useStoryStore = create<StoryStoreState>((set, get) => ({
  history: null,
  replayEngine: null,
  timeline: null,
  snapshot: null,
  currentState: null,
  chapters: [],
  highlights: [],
  narration: [],

  view: initialUrl.view ?? 'replay',
  loading: false,
  loadingMessage: '',
  error: null,
  fromCache: false,
  sharedRepoId: initialUrl.repo ?? null,

  reducedMotion: initialUrl.rm ?? prefersReducedMotion(),
  colorblindSafe: initialUrl.cb ?? false,
  botVisibility: initialUrl.bots ?? 'dim',
  showLabels: true,
  showCaptions: false, // FR-28: narration disabled by default
  exportModalOpen: false,

  loadHistoryObject(raw, meta) {
    const validated = validateHistory(raw);
    if (!validated.ok) {
      const msg = validated.errors
        .slice(0, 3)
        .map((e) => `${e.path}: ${e.message}`)
        .join(' | ');
      set({ error: `Invalid history.json: ${msg}`, loading: false });
      return false;
    }

    const history = validated.data;
    const chapters = meta?.chapters ?? buildChapters(history);
    const highlights = meta?.highlights ?? detectHighlights(history);
    const narration = meta?.narration ?? [];
    const replayEngine = new ReplayEngine(history);
    const timeline = new TimelineEngine(history.events, {
      mode: initialUrl.mode ?? 'adaptive',
      chapters,
      highlights,
    });

    if (initialUrl.idx !== undefined && initialUrl.idx < history.events.length) {
      timeline.seekToIndex(initialUrl.idx);
    }

    const snapshot = timeline.getSnapshot();
    const currentState = replayEngine.getStateAt(snapshot.eventIndex);

    set({
      history,
      replayEngine,
      timeline,
      snapshot,
      currentState,
      chapters,
      highlights,
      narration,
      error: null,
      loading: false,
      loadingMessage: '',
      fromCache: meta?.fromCache ?? false,
      sharedRepoId: meta?.sharedRepoId ?? get().sharedRepoId,
    });
    return true;
  },

  resetToLanding() {
    get().timeline?.pause();
    set({
      history: null,
      replayEngine: null,
      timeline: null,
      snapshot: null,
      currentState: null,
      chapters: [],
      highlights: [],
      narration: [],
      error: null,
      fromCache: false,
      sharedRepoId: null,
    });
  },

  setView: (view) => set({ view }),
  setError: (error) => set({ error, loading: false }),
  setLoading: (loading, loadingMessage = '') => set({ loading, loadingMessage }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setColorblindSafe: (colorblindSafe) => set({ colorblindSafe }),
  setBotVisibility: (botVisibility) => set({ botVisibility }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setShowCaptions(showCaptions) {
    set({ showCaptions });
    const { history, chapters, highlights, narration } = get();
    if (showCaptions && history && narration.length === 0) {
      void defaultNarrator
        .generate({ repoName: history.repo.name, chapters, highlights })
        .then((segments) => {
          if (get().history === history) {
            set({ narration: segments });
          }
        });
    }
  },
  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),

  play() {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.play();
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  pause() {
    const { timeline } = get();
    if (!timeline) return;
    timeline.pause();
    set({ snapshot: timeline.getSnapshot() });
  },

  togglePlay() {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.toggle();
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  tick(dtMs) {
    const { timeline, replayEngine, botVisibility, history } = get();
    if (!timeline || !replayEngine) return;
    const prevIdx = timeline.getSnapshot().eventIndex;
    let snapshot = timeline.tick(dtMs);

    // Optionally skip bot-authored commits during playback when hideBots is active
    if (
      botVisibility === 'hide' &&
      history &&
      snapshot.playing &&
      snapshot.eventIndex >= 0 &&
      history.events[snapshot.eventIndex]?.isBot
    ) {
      let nextIdx = snapshot.eventIndex;
      while (nextIdx < history.events.length - 1 && history.events[nextIdx]?.isBot) {
        nextIdx++;
      }
      if (nextIdx !== snapshot.eventIndex) {
        timeline.seekToIndex(nextIdx);
        snapshot = timeline.getSnapshot();
      }
    }

    const currentState =
      snapshot.eventIndex !== prevIdx
        ? replayEngine.getStateAt(snapshot.eventIndex)
        : get().currentState;
    set({ snapshot, currentState });
  },

  seekToProgress(p) {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.seekToProgress(p);
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  seekToIndex(idx) {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.seekToIndex(idx);
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  stepIndex(delta) {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.stepIndex(delta);
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  jumpToChapter(idx) {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.jumpToChapter(idx);
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  nextChapter() {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.nextChapter();
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  prevChapter() {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.prevChapter();
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },

  setSpeed(speed) {
    const { timeline } = get();
    if (!timeline) return;
    timeline.setSpeed(speed);
    set({ snapshot: timeline.getSnapshot() });
  },

  setPacingMode(mode) {
    const { timeline, replayEngine } = get();
    if (!timeline || !replayEngine) return;
    timeline.setMode(mode);
    const snapshot = timeline.getSnapshot();
    set({ snapshot, currentState: replayEngine.getStateAt(snapshot.eventIndex) });
  },
}));
