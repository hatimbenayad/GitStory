import { describe, expect, it } from 'vitest';
import { buildShareUrl, parseUrlState } from '../src/lib/urlState.js';
import { createSampleHistory } from '../src/lib/sampleHistory.js';
import { useStoryStore } from '../src/store/useStoryStore.js';

describe('urlState & StoryStore (U6)', () => {
  it('round-trips shareable permalink query state cleanly (FR-27)', () => {
    const built = buildShareUrl('https://gitstory.example/', {
      view: 'treemap',
      idx: 7,
      mode: 'constant',
      cb: true,
      rm: true,
      bots: 'hide',
      repo: 'demo-repo-1',
    });
    const parsed = parseUrlState(new URL(built).search);
    expect(parsed).toEqual({
      view: 'treemap',
      idx: 7,
      mode: 'constant',
      cb: true,
      rm: true,
      bots: 'hide',
      repo: 'demo-repo-1',
    });
  });

  it('loads valid sample history, rejects invalid payloads, and supports playback controls', () => {
    const store = useStoryStore.getState();
    expect(store.loadHistoryObject({ schemaVersion: 99 })).toBe(false);
    expect(useStoryStore.getState().error).toContain('Invalid history.json');

    const ok = useStoryStore.getState().loadHistoryObject(createSampleHistory());
    expect(ok).toBe(true);

    const loaded = useStoryStore.getState();
    expect(loaded.history?.events.length).toBeGreaterThan(10);
    expect(loaded.chapters.length).toBe(3);
    expect(loaded.currentState?.totalFiles).toBe(3);

    loaded.jumpToChapter(2);
    expect(useStoryStore.getState().snapshot?.activeChapter?.name).toBe('v1.0.0');

    loaded.resetToLanding();
    expect(useStoryStore.getState().history).toBeNull();
  });
});
