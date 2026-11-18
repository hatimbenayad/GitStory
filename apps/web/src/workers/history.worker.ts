import { buildChapters, detectHighlights, validateHistory } from '@gitstory/core';

interface ProcessWorkerRequest {
  id: number;
  raw: unknown;
}

self.onmessage = (event: MessageEvent<ProcessWorkerRequest>) => {
  const { id, raw } = event.data;
  try {
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    const validated = validateHistory(parsed);
    if (!validated.ok) {
      const msg = validated.errors
        .slice(0, 3)
        .map((e) => `${e.path}: ${e.message}`)
        .join(' | ');
      self.postMessage({ id, ok: false, error: `Invalid history.json: ${msg}` });
      return;
    }

    const history = validated.data;
    const chapters = buildChapters(history);
    const highlights = detectHighlights(history);
    self.postMessage({ id, ok: true, history, chapters, highlights });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
